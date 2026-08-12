import type { H3Event } from 'h3'

export async function sendAuthEmail(
  event: H3Event,
  message: { to: string, subject: string, text: string },
): Promise<void> {
  const { resendApiKey, authEmailFrom } = useRuntimeConfig(event)
  if (!resendApiKey || !authEmailFrom)
    throw new Error('Authentication email is not configured')

  await $fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}` },
    body: {
      from: authEmailFrom,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    },
  })
}
