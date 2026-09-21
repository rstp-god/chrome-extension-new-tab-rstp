// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enTodo from '@/i18n/resources/en/widgets/todoWidget.json'
import { sendVikunjaMessage } from '@/widgets/Todo/integrations/vikunja/bridge.ts'
import { isTestedVikunjaVersion } from '@/widgets/Todo/integrations/vikunja/constants.ts'
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

const urlInput = () => screen.getByLabelText(`${CONNECT_PREFIX}.urlLabel`)
const tokenInput = () => screen.getByLabelText(`${CONNECT_PREFIX}.tokenLabel`)
const submitButton = () => screen.getByRole('button', { name: `${CONNECT_PREFIX}.submit` })
const continueButton = () => screen.getByRole('button', { name: `${CONNECT_PREFIX}.continue` })

/**
 * `userEvent.type` reads `[` and `{` as the start of a key descriptor, so a
 * bracketed IPv6 host has to be escaped by doubling them.
 */
function literal(text: string): string {
  return text.replace(/[[{]/g, '$&$&')
}

/** Stage 1: fill the credentials and press Connect. */
async function probe(url = URL_VALUE, token = TOKEN_VALUE) {
  const user = userEvent.setup()
  await user.type(urlInput(), literal(url))
  await user.type(tokenInput(), literal(token))
  await user.click(submitButton())
  return user
}

beforeEach(() => {
  bridge.mockReset()
  installChrome(true)
})

afterEach(() => {
  cleanup()
  Object.defineProperty(globalThis, 'chrome', { value: undefined, configurable: true })
})

describe('isTestedVikunjaVersion', () => {
  it.each(['v2.6.0', '2.6.0', 'v2.6', '2.6', 'v2.6.12', ' v2.6.0 '])('accepts %s', (version) => {
    expect(isTestedVikunjaVersion(version)).toBe(true)
  })

  it.each(['v2.60', 'v2.60.0', 'v2.5.1', 'v2.7.0', 'v12.6.0', 'v2.6.0-rc1', '', 'unstable'])(
    'rejects %s',
    (version) => {
      expect(isTestedVikunjaVersion(version)).toBe(false)
    },
  )
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
      'continue',
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

    await probe('http://vikunja.example')

    expect(screen.getByRole('alert')).toHaveTextContent(`${CONNECT_PREFIX}.httpsOnly`)
    expect(permissionRequest).not.toHaveBeenCalled()
    expect(bridge).not.toHaveBeenCalled()
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('refuses something that is not a URL at all', async () => {
    const onConnect = renderForm()

    await probe('vikunja.example')

    expect(screen.getByRole('alert')).toHaveTextContent(`${CONNECT_PREFIX}.invalidUrl`)
    expect(permissionRequest).not.toHaveBeenCalled()
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('refuses a URL carrying credentials', async () => {
    renderForm()

    await probe('https://user:pass@vikunja.example')

    expect(screen.getByRole('alert')).toHaveTextContent(`${CONNECT_PREFIX}.invalidUrl`)
    expect(permissionRequest).not.toHaveBeenCalled()
  })

  /**
   * The critical case: `new URL('https://*')` parses, and interpolating that
   * host would turn the request into a grant for every https site.
   */
  it.each(['https://*', 'https://%2A', 'https://*.example.com', 'https://[::1]'])(
    'refuses the wildcard/IPv6 host %s without asking for a permission',
    async (value) => {
      const onConnect = renderForm()

      await probe(value)

      expect(screen.getByRole('alert')).toHaveTextContent(`${CONNECT_PREFIX}.invalidUrl`)
      expect(permissionRequest).not.toHaveBeenCalled()
      expect(bridge).not.toHaveBeenCalled()
      expect(onConnect).not.toHaveBeenCalled()
    },
  )

  it('turns the help text into a link to the instance once the URL parses', async () => {
    renderForm()
    const user = userEvent.setup()

    expect(screen.getByText(`${CONNECT_PREFIX}.helpText`)).toBeInTheDocument()

    await user.type(urlInput(), `${URL_VALUE}/api/v1`)

    const link = screen.getByRole('link', { name: `${CONNECT_PREFIX}.helpLinkLabel` })
    // The `/api/v1` the user pasted is stripped before the link is built.
    expect(link).toHaveAttribute('href', `${URL_VALUE}/user/settings/api-tokens`)
  })
})

describe('host permission', () => {
  it('asks for the host the user typed, without a port', async () => {
    renderForm()
    bridge.mockResolvedValue({ ok: true, value: { userHandle: 'probe', version: 'v2.6.0' } })

    await probe('https://vikunja.example:8443')

    expect(permissionRequest).toHaveBeenCalledWith({ origins: ['https://vikunja.example/*'] })
  })

  it('explains a refusal and saves nothing', async () => {
    installChrome(false)
    const onConnect = renderForm()

    await probe()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(`${CONNECT_PREFIX}.permissionDenied`)
    })
    expect(bridge).not.toHaveBeenCalled()
    expect(onConnect).not.toHaveBeenCalled()
    expect(submitButton()).toBeInTheDocument()
  })

  it('treats a throwing request the same as a refusal', async () => {
    installChrome(new Error('Invalid value for origins'))
    const onConnect = renderForm()

    await probe()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(`${CONNECT_PREFIX}.permissionDenied`)
    })
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('reports permissionMissing when the API is absent altogether', async () => {
    Object.defineProperty(globalThis, 'chrome', { value: {}, configurable: true })
    const onConnect = renderForm()

    await probe()

    expect(screen.getByRole('alert')).toHaveTextContent('integrations.errors.permissionMissing')
    expect(bridge).not.toHaveBeenCalled()
    expect(onConnect).not.toHaveBeenCalled()
  })
})

describe('the two-step flow', () => {
  it('shows who it connected as and only saves on Continue', async () => {
    bridge.mockResolvedValue({ ok: true, value: { userHandle: 'probe', version: 'v2.6.0' } })
    const onConnect = renderForm()

    const user = await probe(`${URL_VALUE}/`)

    // Stage 1 answered; nothing is persisted yet.
    const connected = await screen.findByText(new RegExp(`${CONNECT_PREFIX}\\.connectedAs`))
    expect(connected.textContent).toContain('probe')
    expect(connected.textContent).toContain('v2.6.0')
    expect(onConnect).not.toHaveBeenCalled()
    expect(bridge).toHaveBeenCalledWith({
      type: 'vikunja',
      op: 'connect',
      cfg: { baseUrl: URL_VALUE, token: TOKEN_VALUE },
    })
    expect(screen.queryByText(`${CONNECT_PREFIX}.versionWarning`)).not.toBeInTheDocument()

    // Stage 2.
    await user.click(continueButton())

    await waitFor(() => {
      expect(onConnect).toHaveBeenCalledTimes(1)
    })
    expect(onConnect).toHaveBeenCalledWith({
      baseUrl: URL_VALUE,
      token: TOKEN_VALUE,
      // No board yet: the picker step adds the first one.
      boards: [],
      defaultProjectId: null,
    } satisfies VikunjaConfig)
    // Continue must not re-probe: the store runs `connect` through the adapter.
    expect(bridge).toHaveBeenCalledTimes(1)
  })

  it('warns about an untested version but still offers Continue', async () => {
    bridge.mockResolvedValue({ ok: true, value: { userHandle: 'probe', version: 'v2.60' } })
    renderForm()

    await probe()

    await waitFor(() => {
      expect(screen.getByText(`${CONNECT_PREFIX}.versionWarning`)).toBeInTheDocument()
    })
    expect(continueButton()).toBeInTheDocument()
  })

  it('falls back to the first step when the credentials are edited', async () => {
    bridge.mockResolvedValue({ ok: true, value: { userHandle: 'probe', version: 'v2.6.0' } })
    const onConnect = renderForm()

    const user = await probe()
    await screen.findByText(new RegExp(`${CONNECT_PREFIX}\\.connectedAs`))

    await user.type(tokenInput(), '-rotated')

    expect(submitButton()).toBeInTheDocument()
    expect(
      screen.queryByText(new RegExp(`${CONNECT_PREFIX}\\.connectedAs`)),
    ).not.toBeInTheDocument()
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('shows the worker error and saves nothing when the token is rejected', async () => {
    bridge.mockResolvedValue({ ok: false, errorKey: 'authInvalid' })
    const onConnect = renderForm()

    await probe()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('integrations.errors.authInvalid')
    })
    expect(onConnect).not.toHaveBeenCalled()
    expect(
      screen.queryByText(new RegExp(`${CONNECT_PREFIX}\\.connectedAs`)),
    ).not.toBeInTheDocument()
  })

  it('rejects a payload that does not match the connect schema', async () => {
    bridge.mockResolvedValue({ ok: true, value: { nope: true } })
    const onConnect = renderForm()

    await probe()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('integrations.errors.unknown')
    })
    expect(onConnect).not.toHaveBeenCalled()
  })
})

describe('accessibility and busy state', () => {
  it('announces the message and links it to both inputs', async () => {
    renderForm()

    await probe('http://vikunja.example')

    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('id')
    const id = alert.getAttribute('id')
    expect(urlInput()).toHaveAttribute('aria-describedby', id)
    expect(tokenInput()).toHaveAttribute('aria-describedby', id)
  })

  it('renders exactly one message even when the store is also reporting one', async () => {
    render(<VikunjaConnectForm busy={false} errorKey="network" onConnect={vi.fn(async () => {})} />)
    const user = userEvent.setup()

    await user.type(urlInput(), 'http://vikunja.example')
    await user.type(tokenInput(), TOKEN_VALUE)
    await user.click(submitButton())

    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    // Local validation outranks the store's leftover error.
    expect(alerts[0]).toHaveTextContent(`${CONNECT_PREFIX}.httpsOnly`)
  })

  it('disables the inputs while the store is busy', () => {
    render(<VikunjaConnectForm busy errorKey={null} onConnect={vi.fn(async () => {})} />)

    expect(urlInput()).toBeDisabled()
    expect(tokenInput()).toBeDisabled()
    expect(submitButton()).toBeDisabled()
  })
})
