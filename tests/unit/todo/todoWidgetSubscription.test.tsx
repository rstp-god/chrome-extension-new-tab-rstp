// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RemoteChangeEvent, RemoteScope } from '@/widgets/Todo/integrations/index.ts'
import type { IntegrationState } from '@/widgets/Todo/store/store.ts'

/**
 * The wiring between the worker's broadcast and the store: a descriptor that
 * offers `subscribeRemoteChanges` gets subscribed on mount, a `changed` event
 * turns into a **silent** sync (no spinner, unforced pull) and a `failed` one
 * into an error key.
 *
 * The descriptor is faked at the registry, exactly like `todo.store.test.ts`
 * does, so the test is about the widget's effect rather than about Vikunja's
 * transport — that has `vikunjaSubscribe.test.ts` of its own.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { t: (key: string) => key, changeLanguage: async () => {} },
  }),
}))

// The store persists on every `set`; keep storage inert in jsdom.
vi.mock('@/services/chrome/storage.ts', () => ({
  getArea: vi.fn(async () => null),
  setArea: vi.fn(async () => true),
  removeArea: vi.fn(async () => true),
  getLocal: vi.fn(async () => null),
  setLocal: vi.fn(async () => true),
}))

const fakePullTasks = vi.hoisted(() => vi.fn())
const fakePushTask = vi.hoisted(() => vi.fn())
const fakeSubscribe = vi.hoisted(() =>
  vi.fn<(scope: RemoteScope, onEvent: (event: RemoteChangeEvent) => void) => () => void>(),
)

vi.mock('@/widgets/Todo/integrations/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/widgets/Todo/integrations/index.ts')>()
  return {
    ...actual,
    getIntegrationDescriptor: (name: string | null | undefined) => {
      const real = actual.getIntegrationDescriptor(name)
      if (!real) return null
      return {
        ...real,
        subscribeRemoteChanges: fakeSubscribe,
        create: () => ({
          connect: vi.fn(),
          disconnect: vi.fn(),
          listScopes: vi.fn(),
          listContainers: vi.fn(),
          listProjects: vi.fn(),
          pullTasks: fakePullTasks,
          pushTask: fakePushTask,
        }),
      }
    },
  }
})

import { TodoWidget } from '@/widgets/Todo/TodoWidget.tsx'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'

const VIKUNJA: IntegrationState = {
  name: 'vikunja',
  config: {
    baseUrl: 'https://vikunja.example',
    token: 'tk_super-secret-value',
    projectId: 1,
    viewId: 4,
    kanbanMapping: true,
  },
  boardName: 'Probe',
  lists: [
    { id: '1', name: 'To-Do', isDefault: true },
    { id: '3', name: 'Done', isTerminal: true },
  ],
  projects: [],
  mapping: {
    input: ['1'],
    inprogress: ['1'],
    struggle: ['1'],
    completed: ['3'],
    deleted: ['1'],
  },
  lastSyncAt: null,
}

/** The captured `onEvent` of the one subscription the widget made. */
function emitter(): (event: RemoteChangeEvent) => void {
  expect(fakeSubscribe).toHaveBeenCalledTimes(1)
  return fakeSubscribe.mock.calls[0][1]
}

beforeEach(() => {
  fakePullTasks.mockReset()
  fakePushTask.mockReset()
  fakeSubscribe.mockReset()
  fakeSubscribe.mockReturnValue(() => {})
  fakePullTasks.mockResolvedValue({ ok: true, value: { tasks: [], refs: {} } })
  useTodoStore.setState({
    tasks: [],
    integration: null,
    loading: false,
    errorKey: null,
    conflictTaskIds: [],
  })
})

afterEach(() => {
  cleanup()
})

describe('TodoWidget — remote change subscription', () => {
  it('subscribes with the integration’s scope once it has one', async () => {
    useTodoStore.setState({ integration: VIKUNJA })

    await act(async () => {
      render(<TodoWidget />)
    })

    expect(fakeSubscribe).toHaveBeenCalledTimes(1)
    expect(fakeSubscribe.mock.calls[0][0]).toEqual({ projectId: 1, viewId: 4 })
  })

  it('does not subscribe while the mapping is unfinished', async () => {
    useTodoStore.setState({ integration: { ...VIKUNJA, mapping: null } })

    await act(async () => {
      render(<TodoWidget />)
    })

    expect(fakeSubscribe).not.toHaveBeenCalled()
  })

  it('does not subscribe with no integration at all', async () => {
    await act(async () => {
      render(<TodoWidget />)
    })

    expect(fakeSubscribe).not.toHaveBeenCalled()
  })

  it('answers a `changed` event with a silent, unforced sync', async () => {
    useTodoStore.setState({ integration: VIKUNJA })
    await act(async () => {
      render(<TodoWidget />)
    })
    // The mount sync is the forced one; clear it and watch what the event does.
    expect(fakePullTasks).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
    fakePullTasks.mockClear()

    const onEvent = emitter()
    await act(async () => {
      onEvent({ kind: 'changed' })
    })

    expect(fakePullTasks).toHaveBeenCalledTimes(1)
    expect(fakePullTasks).toHaveBeenCalledWith(expect.objectContaining({ force: false }))
    // Silent: no spinner left behind, and no error.
    expect(useTodoStore.getState().loading).toBe(false)
    expect(useTodoStore.getState().errorKey).toBeNull()
  })

  it('answers a `failed` event with an error key and no sync', async () => {
    useTodoStore.setState({ integration: VIKUNJA })
    await act(async () => {
      render(<TodoWidget />)
    })
    fakePullTasks.mockClear()

    const onEvent = emitter()
    await act(async () => {
      onEvent({ kind: 'failed', errorKey: 'authInvalid' })
    })

    expect(fakePullTasks).not.toHaveBeenCalled()
    expect(useTodoStore.getState().errorKey).toBe('authInvalid')
    expect(useTodoStore.getState().loading).toBe(false)
  })

  it('unsubscribes when the widget goes away', async () => {
    const unsubscribe = vi.fn()
    fakeSubscribe.mockReturnValue(unsubscribe)
    useTodoStore.setState({ integration: VIKUNJA })

    const view = await act(async () => render(<TodoWidget />))
    await act(async () => {
      view.unmount()
    })

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
