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

/**
 * `RemoteScope` values are `string | number` because other backends address
 * themselves numerically; Trello ids are strings, so coerce once here rather
 * than at every call site.
 */
function boardIdOf(scope: RemoteScope): string {
  return String(scope.boardId)
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
    const out = await this.client.getBoardLists(boardIdOf(scope))
    if (!out.ok) return out
    // No `isTerminal`: Trello has no built-in "done" column — any list can
    // be mapped to any status.
    return {
      ok: true,
      value: out.value.map((list) => ({ id: list.id, name: list.name })),
    }
  }

  async listProjects(scope: RemoteScope): Promise<IntegrationOutcome<Project[]>> {
    const out = await this.client.getBoardLabels(boardIdOf(scope))
    if (!out.ok) return out
    return { ok: true, value: out.value.map(labelToProject) }
  }

  async pullTasks(ctx: PullContext): Promise<IntegrationOutcome<PullResult>> {
    const out = await this.client.getBoardCards(boardIdOf(ctx.scope))
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
      const task = cardToTask(card, ctx.mapping, fallbackId)
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
    // A foreign ref (left over from another backend in a hand-edited record)
    // can't address a Trello card — re-link the task by creating one instead
    // of failing every push forever.
    if (op.kind === 'create' || !task.remoteRef || !isTrelloRef(task.remoteRef)) {
      return this.createCard(task, ctx)
    }
    return this.updateCard(task, op, ctx)
  }

  // ---------- internals ----------

  private async createCard(
    task: TodoTask,
    ctx: PushContext,
  ): Promise<IntegrationOutcome<RemoteTaskRef>> {
    const idList = primaryListIdForStatus(task.status, ctx.mapping)
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
    ctx: PushContext,
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

    if (op.kind === 'status' || op.kind === 'delete') {
      patch.idList = primaryListIdForStatus(task.status, ctx.mapping)
    }

    if (op.kind === 'project') {
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
  getScope: (config) => {
    const { boardId } = config as TrelloConfig
    return boardId ? { boardId } : null
  },
  withScope: (config, scope) => ({ ...(config as TrelloConfig), boardId: boardIdOf(scope) }),
  ownsRef: isTrelloRef,
}

export { parseHiddenMetadata }
