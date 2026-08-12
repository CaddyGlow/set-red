import { z } from 'zod'

export const WebhookClickSchema = z.object({
  id: z.string().regex(/^clk_[^.]+$/),
  timestamp: z.string().datetime(),
  country: z.string(),
  region: z.string(),
  city: z.string(),
  device: z.string(),
  browser: z.string(),
  os: z.string(),
  referer: z.string(),
}).strict()

export const WebhookLinkSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  domain: z.string().min(1),
  shortLink: z.string().url(),
}).strict()

export const LinkClickedWebhookSchema = z.object({
  version: z.literal('2'),
  id: z.string().regex(/^evt_[^.]+$/),
  event: z.literal('link.clicked'),
  createdAt: z.string().datetime(),
  data: z.object({
    click: WebhookClickSchema,
    link: WebhookLinkSchema,
  }).strict(),
}).strict()

export type LinkClickedWebhook = z.infer<typeof LinkClickedWebhookSchema>
