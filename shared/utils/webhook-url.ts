const IPV4_PARTS = 4

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.')
  if (parts.length !== IPV4_PARTS || parts.some(part => !/^\d{1,3}$/.test(part)))
    return null
  const octets = parts.map(Number)
  return octets.every(octet => octet >= 0 && octet <= 255) ? octets : null
}

function isPublicIpv4(octets: number[]): boolean {
  const [first, second, third] = octets
  return !(
    first === 0
    || first === 10
    || first === 127
    || (first === 100 && second! >= 64 && second! <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second! >= 16 && second! <= 31)
    || (first === 192 && second === 0 && third === 0)
    || (first === 192 && second === 0 && third === 2)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113)
    || first! >= 224
  )
}

function parseIpv6(hostname: string): number[] | null {
  const source = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  if (!source.includes(':') || source.includes('%'))
    return null

  let normalized = source.toLowerCase()
  const ipv4Match = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (ipv4Match) {
    const ipv4 = parseIpv4(ipv4Match[1]!)
    if (!ipv4)
      return null
    const high = ((ipv4[0]! << 8) | ipv4[1]!).toString(16)
    const low = ((ipv4[2]! << 8) | ipv4[3]!).toString(16)
    normalized = `${normalized.slice(0, -ipv4Match[1]!.length)}${high}:${low}`
  }

  const halves = normalized.split('::')
  if (halves.length > 2)
    return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  if ([...left, ...right].some(part => !/^[0-9a-f]{1,4}$/.test(part)))
    return null
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1))
    return null
  return [...left, ...Array.from({ length: missing }).fill('0'), ...right]
    .map(part => Number.parseInt(String(part), 16))
}

function hasIpv6Prefix(value: number[], prefix: number[], bits: number): boolean {
  const fullWords = Math.floor(bits / 16)
  for (let index = 0; index < fullWords; index++) {
    if (value[index] !== prefix[index])
      return false
  }
  const remainingBits = bits % 16
  if (remainingBits === 0)
    return true
  const mask = (0xFFFF << (16 - remainingBits)) & 0xFFFF
  return (value[fullWords]! & mask) === (prefix[fullWords]! & mask)
}

function isPublicIpv6(value: number[]): boolean {
  // Public unicast IPv6 addresses are allocated from 2000::/3. Exclude the
  // special-purpose ranges within it that must never be webhook destinations.
  return hasIpv6Prefix(value, [0x2000], 3)
    && !hasIpv6Prefix(value, [0x2001, 0x0002, 0x0000], 48)
    && !hasIpv6Prefix(value, [0x2001, 0x0010], 28)
    && !hasIpv6Prefix(value, [0x2001, 0x0020], 28)
    && !hasIpv6Prefix(value, [0x2001, 0x0DB8], 32)
    && !hasIpv6Prefix(value, [0x3FFF, 0x0000], 20)
}

export function isSafeWebhookUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    return false
  }

  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname)
    return false

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost'))
    return false

  const ipv4 = parseIpv4(hostname)
  if (ipv4)
    return isPublicIpv4(ipv4)
  const ipv6 = parseIpv6(hostname)
  if (ipv6 !== null)
    return isPublicIpv6(ipv6)

  return true
}
