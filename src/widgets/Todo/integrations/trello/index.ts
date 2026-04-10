import type {
  IntegrationDescriptor,
  IntegrationOutcome,
  IntegrationPushOp,
  Project,
  PullContext,
  PullResult,
  PushContext,
  RemoteBoard,
  RemoteList,
  RemoteTaskRef,
  TodoIntegration,
} from '@/widgets/Todo/integrations/types.ts'
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
 * Trello adapter. Class form (per the user's preference) — `TrelloClient`
 * holds the credentials and does the wire work; this class layers in the
 * domain logic (mapping, op-aware payload assembly, reconciliation hints).
 *
 * Lifetime: re-instantiated on every store action that touches the network.
 * Construction is cheap (two strings), no caching needed.
 */
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

  disconnect(): void {
    // Nothing to clean up — there is no in-memory subscription, no token
    // refresh timer, no socket. Auth lives only in the persisted store.
  }

  async listBoards(): Promise<IntegrationOutcome<RemoteBoard[]>> {
    const out = await this.client.getMyBoards()
    if (!out.ok) return out
    return {
      ok: true,
      value: out.value.map((board) => ({ id: board.id, name: board.name })),
    }
  }

  async listLists(boardId: string): Promise<IntegrationOutcome<RemoteList[]>> {
    const out = await this.client.getBoardLists(boardId)
    if (!out.ok) return out
    return {
      ok: true,
      value: out.value.map((list) => ({ id: list.id, name: list.name })),
    }
  }

  async listProjects(boardId: string): Promise<IntegrationOutcome<Project[]>> {
    const out = await this.client.getBoardLabels(boardId)
    if (!out.ok) return out
    return { ok: true, value: out.value.map(labelToProject) }
  }

  async pullTasks(ctx: PullContext): Promise<IntegrationOutcome<PullResult>> {
    const out = await this.client.getBoardCards(ctx.boardId)
    if (!out.ok) return out

    // Existing-localId reuse: when we've already synced a card before, the
    // hidden metadata block contains its localId. If the block is missing
    // (e.g. card was created in Trello directly), we mint a fresh UUID,
    // and the next push will write it back via `buildCardDescription`.
    //
    // We also try to match by `cardId → existing local task` so that any
    // earlier in-memory id stays stable across pulls.
    const existingByCardId = new Map<string, string>()
    for (const [localId, ref] of Object.entries(ctx.knownRefs)) {
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
    if (op.kind === 'create' || !task.remoteRef) {
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
    if (!task.remoteRef) {
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
      // Only touch labels when we explicitly changed the project. Other
      // ops leave the user's extra labels alone.
      patch.idLabels = task.projectId ? [task.projectId] : []
    }

    const out = await this.client.updateCard(task.remoteRef.cardId, patch)
    if (!out.ok) return out
    return {
      ok: true,
      value: {
        cardId: out.value.id,
        shortLink: out.value.shortLink ?? task.remoteRef.shortLink,
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
}

// Keep `parseHiddenMetadata` accessible from tests / future tooling without
// re-exporting the entire mapping module.
export { parseHiddenMetadata }
