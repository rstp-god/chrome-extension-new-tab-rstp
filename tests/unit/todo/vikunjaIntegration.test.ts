import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sendVikunjaMessage } from '@/widgets/Todo/integrations/vikunja/bridge.ts'
import { descriptor, VikunjaIntegration } from '@/widgets/Todo/integrations/vikunja/index.ts'

import type { TodoIntegration } from '@/widgets/Todo/integrations/types.ts'
import type { VikunjaConfig } from '@/widgets/Todo/store/store.ts'

vi.mock('@/widgets/Todo/integrations/vikunja/bridge.ts', () => ({
  sendVikunjaMessage: vi.fn(),
}))

const bridge = vi.mocked(sendVikunjaMessage)

const CONFIG: VikunjaConfig = {
  baseUrl: 'https://vikunja.example',
  token: 'tk_super-secret-value',
  projectId: null,
  viewId: null,
  kanbanMapping: true,
}

beforeEach(() => {
  bridge.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('VikunjaIntegration.connect', () => {
  it('sends the credentials as a connect op and reports the token owner', async () => {
    bridge.mockResolvedValue({ ok: true, value: { userHandle: 'probe', version: 'v2.6.0' } })

    await expect(new VikunjaIntegration(CONFIG).connect()).resolves.toEqual({
      ok: true,
      value: { userHandle: 'probe' },
    })

    expect(bridge).toHaveBeenCalledWith({
      type: 'vikunja',
      op: 'connect',
      cfg: { baseUrl: CONFIG.baseUrl, token: CONFIG.token },
    })
  })

  it.each(['authInvalid', 'permissionMissing', 'network', 'unknown'] as const)(
    'passes a %s failure through unchanged',
    async (errorKey) => {
      bridge.mockResolvedValue({ ok: false, errorKey })

      await expect(new VikunjaIntegration(CONFIG).connect()).resolves.toEqual({
        ok: false,
        errorKey,
      })
    },
  )

  it('rejects a payload that does not match the connect schema', async () => {
    // The bridge validates the envelope only, so a worker answering with the
    // wrong shape must not surface as a successful connection.
    bridge.mockResolvedValue({ ok: true, value: { version: 'v2.6.0' } })

    await expect(new VikunjaIntegration(CONFIG).connect()).resolves.toEqual({
      ok: false,
      errorKey: 'unknown',
    })
  })
})

describe('VikunjaIntegration stubs (tasks 5–6)', () => {
  // Typed as the interface on purpose: the stubs declare no parameters, and
  // this is what proves the store can still call them with the full argument
  // list the contract specifies.
  const integration: TodoIntegration = new VikunjaIntegration(CONFIG)
  const scope = { projectId: 1, viewId: 4 }

  it('answers unknown for every op that is not implemented yet', async () => {
    const results = await Promise.all([
      integration.listScopes(),
      integration.listContainers(scope),
      integration.listProjects(scope),
      integration.pullTasks({ scope, mapping: {} as never, knownRefs: {} }),
      integration.pushTask(
        {} as never,
        { kind: 'create' },
        {
          scope,
          mapping: {} as never,
          knownRef: null,
        },
      ),
    ])

    for (const result of results) {
      expect(result).toEqual({ ok: false, errorKey: 'unknown' })
    }
    expect(bridge).not.toHaveBeenCalled()
  })

  it('disconnects without touching the bridge', () => {
    expect(() => integration.disconnect()).not.toThrow()
    expect(bridge).not.toHaveBeenCalled()
  })
})

describe('vikunja descriptor', () => {
  it('registers itself under the persisted name', () => {
    expect(descriptor.name).toBe('vikunja')
    expect(descriptor.titleI18nKey).toBe('todoWidget:integrations.vikunja.title')
    expect(descriptor.descriptionI18nKey).toBe('todoWidget:integrations.vikunja.description')
  })

  it('builds a VikunjaIntegration from a persisted config', () => {
    expect(descriptor.create(CONFIG)).toBeInstanceOf(VikunjaIntegration)
  })

  describe('getScope', () => {
    it('returns the project/view pair once both are set', () => {
      expect(descriptor.getScope({ ...CONFIG, projectId: 1, viewId: 4 })).toEqual({
        projectId: 1,
        viewId: 4,
      })
    })

    it.each([
      ['no view', { projectId: 1, viewId: null }],
      ['no project', { projectId: null, viewId: 4 }],
      ['neither', { projectId: null, viewId: null }],
    ])('returns null with %s — half a scope addresses nothing', (_label, patch) => {
      expect(descriptor.getScope({ ...CONFIG, ...patch })).toBeNull()
    })
  })

  describe('withScope', () => {
    it('writes the pair in and keeps the rest of the config', () => {
      expect(descriptor.withScope(CONFIG, { projectId: 1, viewId: 4 })).toEqual({
        ...CONFIG,
        projectId: 1,
        viewId: 4,
      })
    })

    it('coerces the numeric strings a picker may hand over', () => {
      expect(descriptor.withScope(CONFIG, { projectId: '7', viewId: '9' })).toMatchObject({
        projectId: 7,
        viewId: 9,
      })
    })

    it.each([
      ['a missing half', { projectId: 1 }],
      ['an unparseable half', { projectId: 1, viewId: 'kanban' }],
      ['an empty half', { projectId: '', viewId: 4 }],
    ])('writes null for both halves given %s', (_label, scope) => {
      expect(descriptor.withScope(CONFIG, scope)).toMatchObject({
        projectId: null,
        viewId: null,
      })
    })
  })

  describe('ownsRef', () => {
    it('claims a Vikunja ref', () => {
      expect(descriptor.ownsRef({ taskId: 4, identifier: '#3', bucketId: 1, updated: 'now' })).toBe(
        true,
      )
    })

    it('leaves a Trello ref alone', () => {
      expect(descriptor.ownsRef({ cardId: 'abc', shortLink: null, listId: 'l1', etag: null })).toBe(
        false,
      )
    })
  })
})
