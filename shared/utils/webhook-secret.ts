const WEBHOOK_SECRET_PREFIX = 'whsec_'

export function decodeWebhookSecret(secret: string): Uint8Array<ArrayBuffer> | null {
  if (!secret.startsWith(WEBHOOK_SECRET_PREFIX))
    return null

  try {
    const encoded = secret.slice(WEBHOOK_SECRET_PREFIX.length)
    const decoded = atob(encoded)
    if (decoded.length < 24 || decoded.length > 64 || btoa(decoded) !== encoded)
      return null
    const bytes = new Uint8Array(decoded.length)
    for (let index = 0; index < decoded.length; index++)
      bytes[index] = decoded.charCodeAt(index)
    return bytes
  }
  catch {
    return null
  }
}

export function isValidWebhookSecret(secret: string): boolean {
  return decodeWebhookSecret(secret) !== null
}
