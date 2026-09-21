// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { IntegrationState } from '@/widgets/Todo/store/store.ts'

/**
 * What the widget does with a failure it cannot sync its way out of: a
 * banner with the one action that ends it, no syncing meanwhile, and — for a
 * withdrawn host permission — a grant request that starts inside the click.
 *
 * The descriptor is faked at the registry, like `todo.store.test.ts` and
 * `todoWidgetSubscription.test.tsx` do, so this is about the widget's wiring
 * rather than about Vikunja's transport.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
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
const fakeRecoverPermission = vi.hoisted(() => vi.fn<(config: unknown) => Promise<boolean>>())

vi.mock('@/widgets/Todo/integrations/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/widgets/Todo/integrations/index.ts')>()
  return {
    ...actual,
    getIntegrationDescriptor: (name: string | null | undefined) => {
      const real = actual.getIntegrationDescriptor(name)
      if (!real) return null
      return {
        ...real,
        // Only the backend that has an optional host permission offers this;
        // the `canRecover: false` case gets the Trello descriptor instead.
        recoverPermission: real.name === 'vikunja' ? fakeRecoverPermission : undefined,
        subscribeRemoteChanges: undefined,
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

const MAPPING = {
  input: ['1'],
  inprogress: ['1'],
  struggle: ['1'],
  completed: ['3'],
  deleted: ['1'],
}

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
  mapping: MAPPING,
  lastSyncAt: null,
}

const TRELLO: IntegrationState = {
  name: 'trello',
  config: { apiKey: 'k', token: 't', boardId: 'board-1' },
  boardName: 'Board',
  lists: [{ id: '1', name: 'Inbox' }],
  projects: [],
  mapping: MAPPING,
  lastSyncAt: null,
}

const banner = () => screen.queryByTestId('todo-status-banner')
const bannerAction = () => screen.getByTestId('todo-status-banner-action')

async function mount(state: Partial<ReturnType<typeof useTodoStore.getState>>) {
  useTodoStore.setState(state)
  await act(async () => {
    render(<TodoWidget />)
  })
}

beforeEach(() => {
  fakePullTasks.mockReset()
  fakePushTask.mockReset()
  fakeRecoverPermission.mockReset()
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

describe('TodoWidget — state banners', () => {
  it('names the host whose grant went missing', async () => {
    await mount({ integration: VIKUNJA, errorKey: 'permissionMissing' })

    expect(banner()).not.toBeNull()
    expect(
      screen.getByText('banners.permissionMissing.text {"host":"vikunja.example"}'),
    ).toBeTruthy()
    expect(bannerAction().textContent).toContain('banners.permissionMissing.action')
  })

  it('falls back to generic wording for a backend with no host of its own', async () => {
    await mount({ integration: TRELLO, errorKey: 'permissionMissing' })

    expect(screen.getByText('banners.permissionMissing.textUnknownHost')).toBeTruthy()
    // Nothing to re-request → no button that would only pretend to.
    expect(screen.queryByTestId('todo-status-banner-action')).toBeNull()
  })

  it('offers a reconnect that opens the settings for an invalid token', async () => {
    await mount({ integration: VIKUNJA, errorKey: 'authInvalid' })
    expect(screen.queryByTestId('todo-settings-dialog-content')).toBeNull()

    await act(async () => {
      await userEvent.click(bannerAction())
    })

    expect(screen.getByTestId('todo-settings-dialog-content')).toBeTruthy()
    expect(fakeRecoverPermission).not.toHaveBeenCalled()
  })

  it('shows no banner for a quiet failure, only the badge', async () => {
    await mount({ integration: VIKUNJA })
    // After the mount sync, which clears whatever error it started with.
    await act(async () => {
      useTodoStore.setState({ errorKey: 'network' })
    })

    expect(banner()).toBeNull()
    const badge = screen.getByText('integrations.errors.network')
    expect(badge.className).toContain('text-muted-foreground')
    expect(badge.className).not.toContain('text-destructive')
  })

  it('shows no banner without an integration to fix', async () => {
    await mount({ integration: null, errorKey: 'authInvalid' })

    expect(banner()).toBeNull()
  })

  it('does not sync while a terminal failure stands', async () => {
    await mount({ integration: VIKUNJA, errorKey: 'permissionMissing' })

    expect(fakePullTasks).not.toHaveBeenCalled()
  })

  it('re-requests the permission, then clears the error and syncs', async () => {
    fakeRecoverPermission.mockResolvedValue(true)
    await mount({ integration: VIKUNJA, errorKey: 'permissionMissing' })

    await act(async () => {
      await userEvent.click(bannerAction())
    })

    expect(fakeRecoverPermission).toHaveBeenCalledWith(VIKUNJA.config)
    expect(useTodoStore.getState().errorKey).toBeNull()
    // Exactly one: the guarded mount effect must not read the backend a
    // second time now that the error is gone.
    expect(fakePullTasks).toHaveBeenCalledTimes(1)
    expect(banner()).toBeNull()
  })

  it('keeps the banner when the prompt was refused', async () => {
    fakeRecoverPermission.mockResolvedValue(false)
    await mount({ integration: VIKUNJA, errorKey: 'permissionMissing' })

    await act(async () => {
      await userEvent.click(bannerAction())
    })

    expect(useTodoStore.getState().errorKey).toBe('permissionMissing')
    expect(fakePullTasks).not.toHaveBeenCalled()
    expect(banner()).not.toBeNull()
  })
})

describe('TodoWidget — a terminal error and a single-flight sync', () => {
  it('creates an imported task exactly once, however many callers ask', async () => {
    // The mount is blocked by the banner's error, so the widget has made no
    // sync of its own — and the import plus a manual sync must not each push
    // the same unlinked task, which would create it twice in the backend.
    await mount({
      integration: VIKUNJA,
      errorKey: 'authInvalid',
      tasks: [
        {
          id: 'a',
          title: 'Never pushed',
          description: null,
          status: 'input',
          projectId: null,
          createdAt: 1,
          statusChangedAt: 1,
          completedAt: null,
          deletedAt: null,
          linkedTab: null,
          remoteRef: null,
          syncState: 'dirty',
        },
      ],
    })
    expect(fakePullTasks).not.toHaveBeenCalled()

    fakePushTask.mockResolvedValue({
      ok: true,
      value: { taskId: 7, identifier: '#7', bucketId: 1, updated: '2024-01-01T00:00:00.000Z' },
    })

    await act(async () => {
      await Promise.all([
        useTodoStore.getState().importLocalTasks(['a']),
        useTodoStore.getState().syncNow(),
      ])
    })

    expect(fakePushTask).toHaveBeenCalledTimes(1)
    expect(fakePushTask.mock.calls[0][1]).toEqual({ kind: 'create' })
    expect(fakePullTasks).toHaveBeenCalledTimes(1)
  })
})

describe('TodoWidget — offline flush', () => {
  it('syncs silently when the connection comes back', async () => {
    await mount({ integration: VIKUNJA, errorKey: 'network' })
    fakePullTasks.mockClear()

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    expect(fakePullTasks).toHaveBeenCalledTimes(1)
    // Silent: served from the worker's snapshot, and no spinner left behind.
    expect(fakePullTasks).toHaveBeenCalledWith(expect.objectContaining({ force: false }))
    expect(useTodoStore.getState().loading).toBe(false)
  })

  it('ignores the event while a terminal failure stands', async () => {
    await mount({ integration: VIKUNJA, errorKey: 'authInvalid' })

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    expect(fakePullTasks).not.toHaveBeenCalled()
  })

  it('ignores the event with no integration to flush to', async () => {
    await mount({ integration: null })

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    expect(fakePullTasks).not.toHaveBeenCalled()
  })

  it('stops listening once the widget is gone', async () => {
    useTodoStore.setState({ integration: VIKUNJA })
    const view = await act(async () => render(<TodoWidget />))
    fakePullTasks.mockClear()

    await act(async () => {
      view.unmount()
    })
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    expect(fakePullTasks).not.toHaveBeenCalled()
  })
})
