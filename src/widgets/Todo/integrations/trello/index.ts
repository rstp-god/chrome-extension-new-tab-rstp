import type {
  IntegrationDescriptor,
  IntegrationOutcome,
  IntegrationPushOp,
  Project,
  PullContext,
  PullResult,
  PushContext,
  RemoteContainer,
  RemoteScope,
  RemoteScopeOption,
  RemoteTaskRef,
  StatusListMapping,
  TodoIntegration,
} from '@/widgets/Todo/integrations/types.ts'
import { isTrelloRef } from '@/widgets/Todo/integrations/types.ts'
import type { TodoTask } from '@/widgets/Todo/store/store.ts'

import { TrelloClient } from './client.ts'
import {
  buildCardDescription,
  cardToTask,
  labelToProject,
  parseHiddenMetadata,
  primaryListIdForStatus,
} from './mapping.ts'
import { TrelloConnectForm } from './TrelloConnectForm.tsx'
import type { TrelloConfig } from './types.ts'

/** A mapping row that names no list cannot address a destination. */
const NO_DESTINATION: IntegrationOutcome<never> = { ok: false, errorKey: 'mappingIncomplete' }

/**
 * Neither the scope nor the mapping reached the adapter.
 *
 * Both are nullable in the contract, because a backend that syncs a list of
 * scopes keeps them per scope and answers from its own config (Vikunja).
 * Trello keeps exactly one of each on the integration slice and needs them
 * both, so it says so instead of reading inside a `null`.
 *
 * Unreachable through the store, which starts no sync and no push before
 * `isReadyToSync` — which, for a descriptor without the hook, is precisely
 * "there is a scope and there is a mapping".
 */
const NO_SETUP: IntegrationOutcome<never> = { ok: false, errorKey: 'mappingIncomplete' }

/**
 * `RemoteScope` is an open record, so `boardId` may be missing, numeric (other
 * backends address themselves that way) or empty. Total by construction: a
 * scope that doesn't name a board yields `null` rather than the string
 * `"undefined"` travelling into a request URL.
 */
function boardIdOf(scope: RemoteScope): string | null {
  const raw: unknown = scope.boardId
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const boardId = String(raw)
  return boardId.length > 0 ? boardId : null
}

export class TrelloIntegration implements TodoIntegration {
  private readonly client: TrelloClient

  constructor(config: TrelloConfig) {
    this.client = new TrelloClient(config.apiKey, config.token)
  }

  async connect(): Promise<IntegrationOutcome<{ userHandle: string }>> {
    const out = await this.client.getMe()
    if (!out.ok) return out
    return { ok: true, value: { userHandle: out.value.username } }
  }

  disconnect(): void {}

  async listScopes(): Promise<IntegrationOutcome<RemoteScopeOption[]>> {
    const out = await this.client.getMyBoards()
    if (!out.ok) return out
    return {
      ok: true,
      value: out.value.map((board) => ({ scope: { boardId: board.id }, name: board.name })),
    }
  }

  async listContainers(scope: RemoteScope): Promise<IntegrationOutcome<RemoteContainer[]>> {
    const boardId = boardIdOf(scope)
    if (!boardId) return { ok: false, errorKey: 'notFound' }
    const out = await this.client.getBoardLists(boardId)
    if (!out.ok) return out
    // No `isTerminal`: Trello has no built-in "done" column — any list can
    // be mapped to any status.
    return {
      ok: true,
      value: out.value.map((list) => ({ id: list.id, name: list.name })),
    }
  }

  async listProjects(scope: RemoteScope): Promise<IntegrationOutcome<Project[]>> {
    const boardId = boardIdOf(scope)
    if (!boardId) return { ok: false, errorKey: 'notFound' }
    const out = await this.client.getBoardLabels(boardId)
    if (!out.ok) return out
    return { ok: true, value: out.value.map(labelToProject) }
  }

  async pullTasks(ctx: PullContext): Promise<IntegrationOutcome<PullResult>> {
    const { scope, mapping } = ctx
    if (!scope || !mapping) return NO_SETUP
    const boardId = boardIdOf(scope)
    if (!boardId) return { ok: false, errorKey: 'notFound' }
    const out = await this.client.getBoardCards(boardId)
    if (!out.ok) return out

    const existingByCardId = new Map<string, string>()
    for (const [localId, ref] of Object.entries(ctx.knownRefs)) {
      // Refs from another backend can't be matched against Trello cards.
      if (!isTrelloRef(ref)) continue
      existingByCardId.set(ref.cardId, localId)
    }

    const tasks: TodoTask[] = []
    const refs: Record<string, RemoteTaskRef> = {}

    for (const card of out.value) {
      const fallbackId = existingByCardId.get(card.id)
      const task = cardToTask(card, mapping, fallbackId)
      tasks.push(task)
      if (task.remoteRef) {
        refs[task.id] = task.remoteRef
      }
    }

    return { ok: true, value: { tasks, refs } }
  }

  async pushTask(
    task: TodoTask,
    op: IntegrationPushOp,
    ctx: PushContext,
  ): Promise<IntegrationOutcome<RemoteTaskRef>> {
    // Every write below has to place the card in a list, and only the mapping
    // says which — see `NO_SETUP`.
    const { mapping } = ctx
    if (!mapping) return NO_SETUP
    // A foreign ref (left over from another backend in a hand-edited record)
    // can't address a Trello card — re-link the task by creating one instead
    // of failing every push forever.
    if (op.kind === 'create' || !task.remoteRef || !isTrelloRef(task.remoteRef)) {
      return this.createCard(task, mapping)
    }
    return this.updateCard(task, op, mapping)
  }

  // ---------- internals ----------

  private async createCard(
    task: TodoTask,
    mapping: StatusListMapping,
  ): Promise<IntegrationOutcome<RemoteTaskRef>> {
    const idList = primaryListIdForStatus(task.status, mapping)
    // A mapping row with no list names no destination. The persisted schema
    // forbids one, so this only fires on a hand-edited record — where saying
    // so beats POSTing `idList=undefined`.
    if (idList === undefined) return NO_DESTINATION
    const desc = buildCardDescription(task, task.description ?? '')
    const out = await this.client.createCard({
      name: task.title,
      desc,
      idList,
      idLabels: task.projectId ? [task.projectId] : [],
    })
    if (!out.ok) return out
    return {
      ok: true,
      value: {
        cardId: out.value.id,
        shortLink: out.value.shortLink ?? null,
        listId: out.value.idList,
        etag: out.value.dateLastActivity ?? null,
      },
    }
  }

  private async updateCard(
    task: TodoTask,
    op: IntegrationPushOp,
    mapping: StatusListMapping,
  ): Promise<IntegrationOutcome<RemoteTaskRef>> {
    const knownRef = task.remoteRef
    if (!knownRef || !isTrelloRef(knownRef)) {
      return { ok: false, errorKey: 'pushFailed' }
    }

    const patch: {
      name?: string
      desc?: string
      idList?: string
      idLabels?: string[]
    } = {
      name: task.title,
      desc: buildCardDescription(task, task.description ?? ''),
    }

    // `resync` re-asserts everything the widget owns in one PUT: Trello takes
    // name, desc, list and labels in a single request, so the superset of the
    // three narrower patches costs exactly what any one of them costs.
    if (op.kind === 'status' || op.kind === 'delete' || op.kind === 'resync') {
      const idList = primaryListIdForStatus(task.status, mapping)
      if (idList === undefined) return NO_DESTINATION
      patch.idList = idList
    }

    if (op.kind === 'project' || op.kind === 'resync') {
      patch.idLabels = task.projectId ? [task.projectId] : []
    }

    const out = await this.client.updateCard(knownRef.cardId, patch)
    if (!out.ok) return out
    return {
      ok: true,
      value: {
        cardId: out.value.id,
        shortLink: out.value.shortLink ?? knownRef.shortLink,
        listId: out.value.idList,
        etag: out.value.dateLastActivity ?? null,
      },
    }
  }
}

export const descriptor: IntegrationDescriptor = {
  name: 'trello',
  titleI18nKey: 'todoWidget:integrations.trello.title',
  descriptionI18nKey: 'todoWidget:integrations.trello.description',
  ConnectForm: TrelloConnectForm,
  create: (config) => new TrelloIntegration(config as TrelloConfig),
  /**
   * Unchanged behaviour: a sync has always pushed todos that predate the
   * connection into the board. The flag exists because Vikunja does not do
   * that (see `IntegrationDescriptor.autoImportLocalTasks`), and leaving it
   * off here would quietly change what Trello users already rely on.
   */
  autoImportLocalTasks: true,
  getScope: (config) => {
    const { boardId } = config as TrelloConfig
    return boardId ? { boardId } : null
  },
  // A scope without a usable board id writes `null` — which the persisted
  // schema accepts and which keeps the user on the picker step.
  withScope: (config, scope) => ({ ...(config as TrelloConfig), boardId: boardIdOf(scope) }),
  ownsRef: isTrelloRef,
}

export { parseHiddenMetadata }
