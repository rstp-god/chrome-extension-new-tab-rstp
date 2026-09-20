// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enTodo from '@/i18n/resources/en/widgets/todoWidget.json'
import { sendVikunjaMessage } from '@/widgets/Todo/integrations/vikunja/bridge.ts'
import { VikunjaConnectForm } from '@/widgets/Todo/integrations/vikunja/VikunjaConnectForm.tsx'

import type { VikunjaConfig } from '@/widgets/Todo/store/store.ts'

/**
 * Keys, not prose: the repo's other component tests mock `react-i18next` the
 * same way, and `tests/contracts/i18nKeys.test.ts` already guards the copy.
 * Interpolation values are appended so the "Connected as …" assertion can
 * check that the username and version really reach the message.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { t: (key: string) => key, changeLanguage: async () => {} },
  }),
}))

vi.mock('@/widgets/Todo/integrations/vikunja/bridge.ts', () => ({
  sendVikunjaMessage: vi.fn(),
}))

const bridge = vi.mocked(sendVikunjaMessage)

const URL_VALUE = 'https://vikunja.example'
const TOKEN_VALUE = 'tk_super-secret-value'

const CONNECT_PREFIX = 'integrations.vikunja.connect'

let permissionRequest: ReturnType<typeof vi.fn>

/** Installs a `chrome.permissions.request` that resolves with `granted`. */
function installChrome(granted: boolean | Error = true) {
  permissionRequest = vi.fn(async () => {
    if (granted instanceof Error) throw granted
    return granted
  })
  Object.defineProperty(globalThis, 'chrome', {
    value: { permissions: { request: permissionRequest } },
    configurable: true,
  })
}

function renderForm(onConnect = vi.fn(async () => {})) {
  render(<VikunjaConnectForm busy={false} errorKey={null} onConnect={onConnect} />)
  return onConnect
}

async function fillAndSubmit(url = URL_VALUE, token = TOKEN_VALUE) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(`${CONNECT_PREFIX}.urlLabel`), url)
  await user.type(screen.getByLabelText(`${CONNECT_PREFIX}.tokenLabel`), token)
  await user.click(screen.getByRole('button', { name: `${CONNECT_PREFIX}.submit` }))
}

beforeEach(() => {
  bridge.mockReset()
  installChrome(true)
})

afterEach(() => {
  cleanup()
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })
})

describe('i18n keys the form relies on', () => {
  it('all exist in the English resource', () => {
    const connect = enTodo.integrations.vikunja.connect as Record<string, string>

    for (const key of [
      'title',
      'description',
      'urlLabel',
      'urlPlaceholder',
      'tokenLabel',
      'helpLinkLabel',
      'helpText',
      'submit',
      'invalidUrl',
      'httpsOnly',
      'permissionDenied',
      'connectedAs',
      'versionWarning',
    ]) {
      expect(connect[key], key).toBeTruthy()
    }
  })
})

describe('URL validation', () => {
  it('refuses plain http inline and never asks for a permission', async () => {
    const onConnect = renderForm()

    await fillAndSubmit('http://vikunja.example')

    expect(screen.getByText(`${CONNECT_PREFIX}.httpsOnly`)).toBeInTheDocument()
    expect(permissionRequest).not.toHaveBeenCalled()
    expect(bridge).not.toHaveBeenCalled()
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('refuses something that is not a URL at all', async () => {
    const onConnect = renderForm()

    await fillAndSubmit('vikunja.example')

    expect(screen.getByText(`${CONNECT_PREFIX}.invalidUrl`)).toBeInTheDocument()
    expect(permissionRequest).not.toHaveBeenCalled()
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('refuses a URL carrying credentials or a query', async () => {
    renderForm()

    await fillAndSubmit('https://user:pass@vikunja.example')

    expect(screen.getByText(`${CONNECT_PREFIX}.invalidUrl`)).toBeInTheDocument()
    expect(permissionRequest).not.toHaveBeenCalled()
  })

  it('turns the help text into a link to the instance once the URL parses', async () => {
    renderForm()
    const user = userEvent.setup()

    expect(screen.getByText(`${CONNECT_PREFIX}.helpText`)).toBeInTheDocument()

    await user.type(screen.getByLabelText(`${CONNECT_PREFIX}.urlLabel`), `${URL_VALUE}/api/v1`)

    const link = screen.getByRole('link', { name: `${CONNECT_PREFIX}.helpLinkLabel` })
    // The `/api/v1` the user pasted is stripped before the link is built.
    expect(link).toHaveAttribute('href', `${URL_VALUE}/user/settings/api-tokens`)
  })
})

describe('host permission', () => {
  it('asks for the host the user typed, without a port', async () => {
    renderForm()
    bridge.mockResolvedValue({ ok: true, value: { userHandle: 'probe', version: 'v2.6.0' } })

    await fillAndSubmit('https://vikunja.example:8443')

    expect(permissionRequest).toHaveBeenCalledWith({ origins: ['https://vikunja.example/*'] })
  })

  it('explains a refusal and saves nothing', async () => {
    installChrome(false)
    const onConnect = renderForm()

    await fillAndSubmit()

    await waitFor(() => {
      expect(screen.getByText(`${CONNECT_PREFIX}.permissionDenied`)).toBeInTheDocument()
    })
    expect(bridge).not.toHaveBeenCalled()
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('treats a throwing request the same as a refusal', async () => {
    installChrome(new Error('Invalid value for origins'))
    const onConnect = renderForm()

    await fillAndSubmit()

    await waitFor(() => {
      expect(screen.getByText(`${CONNECT_PREFIX}.permissionDenied`)).toBeInTheDocument()
    })
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('reports permissionMissing when the API is absent altogether', async () => {
    Object.defineProperty(globalThis, 'chrome', { value: {}, configurable: true })
    const onConnect = renderForm()

    await fillAndSubmit()

    expect(screen.getByText('integrations.errors.permissionMissing')).toBeInTheDocument()
    expect(bridge).not.toHaveBeenCalled()
    expect(onConnect).not.toHaveBeenCalled()
  })
})

describe('connecting', () => {
  it('reports who it connected as and hands the exact config to the store', async () => {
    bridge.mockResolvedValue({ ok: true, value: { userHandle: 'probe', version: 'v2.6.0' } })
    const onConnect = renderForm()

    await fillAndSubmit(`${URL_VALUE}/`)

    await waitFor(() => {
      expect(onConnect).toHaveBeenCalledTimes(1)
    })

    expect(bridge).toHaveBeenCalledWith({
      type: 'vikunja',
      op: 'connect',
      cfg: { baseUrl: URL_VALUE, token: TOKEN_VALUE },
    })
    expect(onConnect).toHaveBeenCalledWith({
      baseUrl: URL_VALUE,
      token: TOKEN_VALUE,
      projectId: null,
      viewId: null,
      kanbanMapping: true,
    } satisfies VikunjaConfig)

    const connected = screen.getByText(new RegExp(`${CONNECT_PREFIX}\\.connectedAs`))
    expect(connected.textContent).toContain('probe')
    expect(connected.textContent).toContain('v2.6.0')
    expect(screen.queryByText(`${CONNECT_PREFIX}.versionWarning`)).not.toBeInTheDocument()
  })

  it('warns about an untested version but still connects', async () => {
    bridge.mockResolvedValue({ ok: true, value: { userHandle: 'probe', version: 'v2.4.1' } })
    const onConnect = renderForm()

    await fillAndSubmit()

    await waitFor(() => {
      expect(screen.getByText(`${CONNECT_PREFIX}.versionWarning`)).toBeInTheDocument()
    })
    expect(onConnect).toHaveBeenCalledTimes(1)
  })

  it('shows the worker error and saves nothing when the token is rejected', async () => {
    bridge.mockResolvedValue({ ok: false, errorKey: 'authInvalid' })
    const onConnect = renderForm()

    await fillAndSubmit()

    await waitFor(() => {
      expect(screen.getByText('integrations.errors.authInvalid')).toBeInTheDocument()
    })
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('rejects a payload that does not match the connect schema', async () => {
    bridge.mockResolvedValue({ ok: true, value: { nope: true } })
    const onConnect = renderForm()

    await fillAndSubmit()

    await waitFor(() => {
      expect(screen.getByText('integrations.errors.unknown')).toBeInTheDocument()
    })
    expect(onConnect).not.toHaveBeenCalled()
  })
})
