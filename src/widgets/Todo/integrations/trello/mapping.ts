import type { Project, StatusListMapping, TodoStatus } from '@/widgets/Todo/integrations/types.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'

import { TRELLO_HIDDEN_METADATA_VERSION } from './constants.ts'
import { getTrelloProjectPillClass } from './projectStyles.ts'
import { trelloHiddenMetadataSchema, type TrelloCard, type TrelloLabel } from './schema.ts'
import type { TrelloHiddenMetadata } from './types.ts'

/**
 * Anchored to end-of-string so a stray `<!--` written by the user earlier in
 * the description can't accidentally trip the parser.
 */
const HIDDEN_METADATA_RE = /\n*<!-- newtab-todo:v1\s*([\s\S]*?)\s*-->\s*$/

export interface ParsedDescription {
  userText: string
  meta: TrelloHiddenMetadata | null
}

export function parseHiddenMetadata(desc: string): ParsedDescription {
  const match = desc.match(HIDDEN_METADATA_RE)
  if (!match) {
    return { userText: desc.trimEnd(), meta: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(match[1])
  } catch {
    return { userText: desc.slice(0, match.index).trimEnd(), meta: null }
  }

  const result = trelloHiddenMetadataSchema.safeParse(parsed)
  if (!result.success) {
    return { userText: desc.slice(0, match.index).trimEnd(), meta: null }
  }

  return {
    userText: desc.slice(0, match.index).trimEnd(),
    meta: result.data,
  }
}

export function writeHiddenMetadata(userText: string, meta: TrelloHiddenMetadata): string {
  const trimmed = userText.trimEnd()
  const blob = JSON.stringify(meta)
  const block = `<!-- newtab-todo:v1\n${blob}\n-->`
  return trimmed.length > 0 ? `${trimmed}\n\n${block}` : block
}

export function statusForListId(listId: string, mapping: StatusListMapping): TodoStatus {
  for (const status of Object.keys(mapping) as TodoStatus[]) {
    if (mapping[status].includes(listId)) return status
  }
  return 'input'
}

export function primaryListIdForStatus(status: TodoStatus, mapping: StatusListMapping): string {
  return mapping[status][0]
}

export function labelToProject(label: TrelloLabel): Project {
  return {
    id: label.id,
    name: label.name,
    pillClassName: getTrelloProjectPillClass(label.color),
  }
}

export function cardToTask(
  card: TrelloCard,
  mapping: StatusListMapping,
  existingId?: string,
): TodoTask {
  const { userText, meta } = parseHiddenMetadata(card.desc)
  const status = statusForListId(card.idList, mapping)

  const fallbackTimestamp = card.dateLastActivity ? Date.parse(card.dateLastActivity) : Date.now()
  const createdAt = meta?.createdAt ?? fallbackTimestamp
  const statusChangedAt = meta?.statusChangedAt ?? fallbackTimestamp

  return {
    id: meta?.localId ?? existingId ?? crypto.randomUUID(),
    title: card.name,
    description: userText.length > 0 ? userText : null,
    status,
    projectId: card.idLabels[0] ?? null,
    createdAt,
    statusChangedAt,
    completedAt: status === 'completed' ? statusChangedAt : null,
    deletedAt: status === 'deleted' ? statusChangedAt : null,
    linkedTab: null,
    remoteRef: {
      cardId: card.id,
      shortLink: card.shortLink ?? null,
      listId: card.idList,
      etag: card.dateLastActivity ?? null,
    },
    syncState: 'clean',
  }
}

export function buildCardDescription(task: TodoTask, userText: string): string {
  const meta: TrelloHiddenMetadata = {
    version: TRELLO_HIDDEN_METADATA_VERSION,
    localId: task.id,
    createdAt: task.createdAt,
    statusChangedAt: task.statusChangedAt,
  }
  return writeHiddenMetadata(userText, meta)
}
