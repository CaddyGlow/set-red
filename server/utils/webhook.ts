import type { H3Event } from 'h3'
import type { Link } from '#shared/schemas/link'
import type { LinkClickedWebhook } from '#shared/schemas/webhook'
import type { WebhookClickContext } from './access-log'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { decodeWebhookSecret } from '../../shared/utils/webhook-secret'
import { isSafeWebhookUrl } from '../../shared/utils/webhook-url'
import { domains, workspaceSettings } from '../database/schema'

const WEBHOOK_TIMEOUT_MS = 10_000

type WebhookFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

interface DeliverWebhookOptions {
  url: string
  secret?: string
  payload: LinkClickedWebhook
  deliveryTimestamp?: number
  fetcher?: WebhookFetch
}

interface CreateWebhookDeliveryOptions {
  url: string
  secret?: string
  click: WebhookClickContext
  link: Pick<Link, 'id' | 'slug'> & { domain: string, shortLink: string }
  fetcher?: WebhookFetch
}

export class WebhookDeliveryError extends Error {
  constructor(public code: string, public status?: number) {
    super(code)
    this.name = 'WebhookDeliveryError'
  }
}

export function isWebhookConfigured(url: string): boolean {
  return Boolean(url.trim())
}

export function createLinkClickedWebhook(click: WebhookClickContext, link: Pick<Link, 'id' | 'slug'> & { domain: string, shortLink: string }): LinkClickedWebhook {
  const createdAt = new Date().toISOString()

  return {
    version: '2',
    id: `evt_${crypto.randomUUID()}`,
    event: 'link.clicked',
    createdAt,
    data: {
      click: {
        id: `clk_${crypto.randomUUID()}`,
        timestamp: createdAt,
        country: click.country,
        region: click.region,
        city: click.city,
        device: click.device,
        browser: click.browser,
        os: click.os,
        referer: click.referer,
      },
      link: {
        id: link.id,
        slug: link.slug,
        domain: link.domain,
        shortLink: link.shortLink,
      },
    },
  }
}

export async function signWebhook(id: string, deliveryTimestamp: number, rawBody: string, secret: string): Promise<string> {
  const secretBytes = decodeWebhookSecret(secret)
  if (!secretBytes)
    throw new WebhookDeliveryError('invalid_secret')
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const input = new TextEncoder().encode(`${id}.${deliveryTimestamp}.${rawBody}`)
  const signature = await crypto.subtle.sign('HMAC', key, input)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
  return `v1,${base64}`
}

export async function deliverWebhook(options: DeliverWebhookOptions): Promise<void> {
  if (!isSafeWebhookUrl(options.url))
    throw new WebhookDeliveryError('invalid_url')
  const url = new URL(options.url)

  const deliveryTimestamp = options.deliveryTimestamp ?? Math.floor(Date.now() / 1000)
  const rawBody = JSON.stringify(options.payload)
  const headers = new Headers({
    'Content-Type': 'application/json',
    'webhook-id': options.payload.id,
    'webhook-timestamp': String(deliveryTimestamp),
  })
  if (options.secret)
    headers.set('webhook-signature', await signWebhook(options.payload.id, deliveryTimestamp, rawBody, options.secret))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)
  try {
    const response = await (options.fetcher || fetch)(url, {
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
      headers,
      body: rawBody,
    })

    await response.body?.cancel()
    if (!response.ok)
      throw new WebhookDeliveryError('unexpected_status', response.status)
  }
  finally {
    clearTimeout(timeout)
  }
}

export async function handleWebhookDelivery(delivery: Promise<void>): Promise<void> {
  try {
    await delivery
  }
  catch (error) {
    console.error({
      event: 'webhook.delivery.failed',
      code: error instanceof WebhookDeliveryError ? error.code : 'request_failed',
      status: error instanceof WebhookDeliveryError ? error.status : undefined,
    })
  }
}

export function createWebhookDelivery(options: CreateWebhookDeliveryOptions): Promise<void> | undefined {
  if (!isWebhookConfigured(options.url))
    return

  return deliverWebhook({
    url: options.url,
    secret: options.secret,
    payload: createLinkClickedWebhook(options.click, options.link),
    fetcher: options.fetcher,
  })
}

export function scheduleWebhookDelivery(context: Pick<ExecutionContext, 'waitUntil'>, delivery: Promise<void> | undefined): void {
  if (delivery)
    context.waitUntil(handleWebhookDelivery(delivery))
}

export function queueLinkClickedWebhook(event: H3Event, click: WebhookClickContext, link: Pick<Link, 'id' | 'slug' | 'workspaceId' | 'domainId'>): void {
  const delivery = (async () => {
    const [settings] = await drizzle(event.context.cloudflare.env.DB)
      .select({
        webhookUrl: workspaceSettings.webhookUrl,
        webhookSecret: workspaceSettings.webhookSecret,
        domain: domains.hostname,
      })
      .from(workspaceSettings)
      .innerJoin(domains, and(
        eq(domains.id, link.domainId),
        eq(domains.workspaceId, workspaceSettings.workspaceId),
      ))
      .where(eq(workspaceSettings.workspaceId, link.workspaceId))
      .limit(1)
    if (!settings?.webhookUrl)
      return
    await createWebhookDelivery({
      url: settings.webhookUrl,
      secret: settings.webhookSecret ?? undefined,
      click,
      link: {
        id: link.id,
        slug: link.slug,
        domain: settings.domain,
        shortLink: `https://${settings.domain}/${link.slug}`,
      },
    })
  })()
  scheduleWebhookDelivery(event.context.cloudflare.context, delivery)
}
