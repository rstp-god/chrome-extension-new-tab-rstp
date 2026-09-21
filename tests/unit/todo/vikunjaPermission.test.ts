import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { recoverVikunjaPermission } from '@/widgets/Todo/integrations/vikunja/permission.ts'

import type { VikunjaConfig } from '@/widgets/Todo/store/store.ts'

/**
 * Re-granting the instance's origin from the widget's banner. The interesting
 * parts are the pattern it asks for (a wildcard host must never become a
 * wildcard grant) and the fact that every failure reads as "not granted".
 */
function config(overrides: Partial<VikunjaConfig> = {}): VikunjaConfig {
  return {
    baseUrl: 'https://tasks.example.com',
    token: 'tk',
    projectId: 1,
    viewId: 4,
    kanbanMapping: true,
    ...overrides,
  }
}

let request: ReturnType<typeof vi.fn>

function installChrome(answer: boolean | Error | undefined = true) {
  request =
    answer === undefined
      ? vi.fn()
      : vi.fn(async () => {
          if (answer instanceof Error) throw answer
          return answer
        })
  Object.defineProperty(globalThis, 'chrome', {
    value: { permissions: { request } },
    configurable: true,
  })
}

beforeEach(() => {
  installChrome(true)
})

afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })
})

describe('recoverVikunjaPermission', () => {
  it('asks for the instance host as a match pattern, and answers the grant', async () => {
    await expect(recoverVikunjaPermission(config())).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith({ origins: ['https://tasks.example.com/*'] })
  })

  it('drops the port, which a match pattern cannot carry', async () => {
    await recoverVikunjaPermission(config({ baseUrl: 'https://tasks.example.com:8443' }))
    expect(request).toHaveBeenCalledWith({ origins: ['https://tasks.example.com/*'] })
  })

  it('answers false when the prompt was dismissed', async () => {
    installChrome(false)
    await expect(recoverVikunjaPermission(config())).resolves.toBe(false)
  })

  it('answers false when the request throws', async () => {
    installChrome(new Error('nope'))
    await expect(recoverVikunjaPermission(config())).resolves.toBe(false)
  })

  it.each(['https://*.example.com', 'https://*', 'http://tasks.example.com', 'not a url', ''])(
    'refuses to ask for anything derived from %s, and asks nothing at all',
    async (baseUrl) => {
      await expect(recoverVikunjaPermission(config({ baseUrl }))).resolves.toBe(false)
      expect(request).not.toHaveBeenCalled()
    },
  )

  it('answers false where there is no chrome to ask', async () => {
    Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })
    await expect(recoverVikunjaPermission(config())).resolves.toBe(false)
  })

  it('answers false for a config that is not one', async () => {
    await expect(recoverVikunjaPermission({})).resolves.toBe(false)
    await expect(recoverVikunjaPermission(null)).resolves.toBe(false)
  })

  it('calls request before it awaits anything, so the gesture survives', () => {
    // Not `await`ed on purpose: the call must already have happened by the
    // time this function returns, which is what Chrome requires of a
    // permission request made from a click.
    void recoverVikunjaPermission(config())
    expect(request).toHaveBeenCalledTimes(1)
  })
})
