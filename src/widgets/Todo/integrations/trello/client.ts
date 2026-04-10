import type { IntegrationErrorKey, IntegrationOutcome } from '@/widgets/Todo/integrations/types.ts'

import {
  trelloBoardSchema,
  trelloCardSchema,
  trelloLabelSchema,
  trelloListSchema,
  trelloMemberSchema,
  type TrelloBoard,
  type TrelloCard,
  type TrelloLabel,
  type TrelloList,
  type TrelloMember,
} from './schema.ts'
import { TRELLO_API_BASE } from './types.ts'
import { z } from 'zod'

type Query = Record<string, string | undefined>
type RequestOptions = {
  query?: Query
  body?: unknown
}

interface CreateCardBody {
  name: string
  desc: string
  idList: string
  idLabels?: string[]
}

interface UpdateCardBody {
  name?: string
  desc?: string
  idList?: string
  idLabels?: string[]
}

/**
 * Low-level Trello REST wrapper. Plain `fetch`, no third-party HTTP libs.
 *
 * Three responsibilities:
 *   1. Build the URL with `key` + `token` query params.
 *   2. Translate HTTP status codes into our `IntegrationErrorKey` union.
 *   3. **Never** leak `key=` / `token=` in error messages — `redact` strips
 *      both before any string crosses the class boundary.
 *
 * Every method returns `IntegrationOutcome<T>` and never throws on expected
 * failures (network, 4xx, 5xx, malformed JSON). Unexpected throws bubble up.
 */
export class TrelloClient {
  constructor(
    private readonly apiKey: string,
    private readonly token: string,
  ) {}

  // ---------- public surface ----------

  getMe(): Promise<IntegrationOutcome<TrelloMember>> {
    return this.request('/members/me', trelloMemberSchema, {
      query: { fields: 'id,username,fullName' },
    })
  }

  getMyBoards(): Promise<IntegrationOutcome<TrelloBoard[]>> {
    return this.requestArray('/members/me/boards', trelloBoardSchema, {
      query: { fields: 'id,name', filter: 'open' },
    })
  }

  getBoardLists(boardId: string): Promise<IntegrationOutcome<TrelloList[]>> {
    return this.requestArray(`/boards/${encodeURIComponent(boardId)}/lists`, trelloListSchema, {
      query: { fields: 'id,name', filter: 'open' },
    })
  }

  getBoardLabels(boardId: string): Promise<IntegrationOutcome<TrelloLabel[]>> {
    return this.requestArray(`/boards/${encodeURIComponent(boardId)}/labels`, trelloLabelSchema, {
      query: { fields: 'id,name,color' },
    })
  }

  getBoardCards(boardId: string): Promise<IntegrationOutcome<TrelloCard[]>> {
    return this.requestArray(`/boards/${encodeURIComponent(boardId)}/cards`, trelloCardSchema, {
      query: {
        fields: 'id,name,desc,idList,idLabels,shortLink,dateLastActivity',
        filter: 'visible',
      },
    })
  }

  createCard(payload: CreateCardBody): Promise<IntegrationOutcome<TrelloCard>> {
    return this.request(
      '/cards',
      trelloCardSchema,
      {
        body: payload,
      },
      'POST',
    )
  }

  updateCard(cardId: string, patch: UpdateCardBody): Promise<IntegrationOutcome<TrelloCard>> {
    return this.request(
      `/cards/${encodeURIComponent(cardId)}`,
      trelloCardSchema,
      {
        body: patch,
      },
      'PUT',
    )
  }

  // ---------- internals ----------

  private buildUrl(path: string, query: Query = {}): string {
    const url = new URL(TRELLO_API_BASE + path)
    url.searchParams.set('key', this.apiKey)
    url.searchParams.set('token', this.token)
    for (const [k, v] of Object.entries(query)) {
      if (v != null) url.searchParams.set(k, v)
    }
    return url.toString()
  }

  /** Strip `key=` / `token=` from any string we might log or surface. */
  private redact(message: string): string {
    return message.replace(/([?&](?:key|token))=[^&\s]+/gi, '$1=…')
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    opts: RequestOptions = {},
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  ): Promise<IntegrationOutcome<T>> {
    const url = this.buildUrl(path, opts.query)

    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      })
    } catch (error) {
      // Network error / DNS / CORS — never expose the URL.
      void this.redact(String(error))
      return { ok: false, errorKey: 'network' }
    }

    const errorKey = this.statusToErrorKey(res.status)
    if (errorKey) return { ok: false, errorKey }

    let json: unknown
    try {
      json = await res.json()
    } catch {
      return { ok: false, errorKey: 'unknown' }
    }

    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      return { ok: false, errorKey: 'unknown' }
    }
    return { ok: true, value: parsed.data }
  }

  private async requestArray<T>(
    path: string,
    itemSchema: z.ZodType<T>,
    opts: RequestOptions = {},
  ): Promise<IntegrationOutcome<T[]>> {
    return this.request(path, z.array(itemSchema), opts)
  }

  private statusToErrorKey(status: number): IntegrationErrorKey | null {
    if (status >= 200 && status < 300) return null
    if (status === 401 || status === 403) return 'authInvalid'
    if (status === 404) return 'notFound'
    if (status === 429) return 'rateLimited'
    return 'unknown'
  }
}
