import { z } from 'zod'

/**
 * Trusted-slice Zod schemas for Trello REST responses. We never `as` raw JSON
 * straight into our types — every API call funnels through `safeParse` here
 * and treats failures as `unknown` errors.
 */

export const trelloMemberSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string().nullable().optional(),
})

export const trelloBoardSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const trelloListSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const trelloLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
})

export const trelloCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().default(''),
  idList: z.string(),
  idLabels: z.array(z.string()),
  shortLink: z.string().nullable().optional(),
  dateLastActivity: z.string().nullable().optional(),
})

export const trelloHiddenMetadataSchema = z.object({
  version: z.literal(1),
  localId: z.string(),
  createdAt: z.number(),
  statusChangedAt: z.number(),
})

export type TrelloMember = z.infer<typeof trelloMemberSchema>
export type TrelloBoard = z.infer<typeof trelloBoardSchema>
export type TrelloList = z.infer<typeof trelloListSchema>
export type TrelloLabel = z.infer<typeof trelloLabelSchema>
export type TrelloCard = z.infer<typeof trelloCardSchema>
