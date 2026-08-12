/**
 * Copies the deploy configuration from .env into GitHub Actions secrets and
 * variables, so `deploy.yml` can build and publish.
 *
 * Values are piped straight to `gh` and never printed; only names and outcomes
 * are logged.
 *
 * Usage:
 *   node scripts/setup-github-actions.mjs [--dry-run] [--repo owner/name] [--env-file .env]
 */
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { parseEnv } from 'node:util'

const SECRETS = [
  { name: 'CLOUDFLARE_API_TOKEN', required: true, hint: 'API token with Workers, D1 and KV edit permissions' },
  { name: 'CLOUDFLARE_ACCOUNT_ID', required: true, hint: 'Cloudflare account ID' },
  { name: 'DEPLOY_D1_DATABASE_ID', required: true, hint: 'D1 database ID used by the deploy config' },
  { name: 'DEPLOY_KV_NAMESPACE_ID', required: true, hint: 'KV namespace ID used by the deploy config' },
  { name: 'NUXT_CF_ACCESS_TEAM_DOMAIN', required: false, hint: 'Zero Trust team domain; without it the Access button is dropped from /login' },
  { name: 'NUXT_CF_ACCESS_AUD', required: false, hint: 'Access application audience tag' },
]

const VARIABLES = [
  { name: 'DEPLOY_D1_DATABASE_NAME', required: true },
  { name: 'DEPLOY_ANALYTICS_DATASET', required: true },
  { name: 'DEPLOY_R2_BUCKET_NAME', required: false },
  { name: 'NUXT_AUTH_PUBLIC_SIGNUP_ENABLED', required: false, fallback: 'false' },
  { name: 'NUXT_AUTH_EMAIL_PASSWORD_ENABLED', required: false, fallback: 'true' },
]

function parseArgs(argv) {
  const options = { dryRun: false, repo: '', envFile: '.env' }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--dry-run')
      options.dryRun = true
    else if (arg === '--repo')
      options.repo = argv[++index] ?? ''
    else if (arg === '--env-file')
      options.envFile = argv[++index] ?? '.env'
    else
      throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function run(command, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => (stdout += chunk))
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0)
        resolve(stdout.trim())
      else
        reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })
    if (input !== undefined) {
      child.stdin.end(input)
    }
  })
}

async function loadEnvFile(path) {
  try {
    return parseEnv(await readFile(path, 'utf8'))
  }
  catch (error) {
    if (error.code === 'ENOENT')
      throw new Error(`No ${path} found. Pass --env-file to point at one.`)
    throw error
  }
}

/**
 * Resolved from the `origin` remote rather than `gh repo view`: in a fork,
 * `gh` can resolve to the upstream repository, which would send this
 * instance's deploy configuration to someone else's repository.
 */
async function resolveOriginRepo() {
  const url = await run('git', ['remote', 'get-url', 'origin']).catch(() => {
    throw new Error('No `origin` remote found. Pass --repo owner/name.')
  })
  const match = url.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/)
  if (!match)
    throw new Error(`Could not read a GitHub repository from origin: ${url}`)
  return `${match[1]}/${match[2]}`
}

function resolve(entry, env) {
  const raw = process.env[entry.name] ?? env[entry.name] ?? entry.fallback ?? ''
  return typeof raw === 'string' ? raw.trim() : ''
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  await run('gh', ['auth', 'status']).catch(() => {
    throw new Error('gh is not authenticated. Run `gh auth login` first.')
  })

  const repo = options.repo || await resolveOriginRepo()
  const env = await loadEnvFile(options.envFile)

  console.log(`Repository: ${repo}`)
  console.log(`Source:     ${options.envFile}${options.dryRun ? ' (dry run, nothing will be written)' : ''}\n`)

  const missingRequired = []
  let applied = 0

  for (const [kind, entries] of [['secret', SECRETS], ['variable', VARIABLES]]) {
    console.log(`${kind === 'secret' ? 'Secrets' : 'Variables'}:`)
    for (const entry of entries) {
      const value = resolve(entry, env)
      if (!value) {
        const label = entry.required ? 'MISSING' : 'skipped'
        console.log(`  ${label.padEnd(8)} ${entry.name}${entry.hint ? ` — ${entry.hint}` : ''}`)
        if (entry.required)
          missingRequired.push(entry.name)
        continue
      }

      if (options.dryRun) {
        console.log(`  would set ${entry.name}`)
        continue
      }

      // gh reads the value from stdin when --body is omitted, which keeps it
      // out of the process list.
      await run('gh', [kind, 'set', entry.name, '--repo', repo], { input: value })
      console.log(`  set      ${entry.name}`)
      applied++
    }
    console.log('')
  }

  if (missingRequired.length > 0) {
    console.error(`Missing required values: ${missingRequired.join(', ')}`)
    console.error('Add them to your env file or export them, then run this again.')
    process.exitCode = 1
    return
  }

  if (!options.dryRun)
    console.log(`Done. ${applied} value${applied === 1 ? '' : 's'} written to ${repo}.`)
}

await main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
