import { ExternalLinkIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { normalizeVikunjaBaseUrl, vikunjaHostPattern } from '@/background/vikunja/messages.ts'
import { Button } from '@/components/ui/button.tsx'
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { getChromeObject } from '@/services/chrome/runtime.ts'

import { sendVikunjaMessage } from './bridge.ts'
import { isTestedVikunjaVersion, VIKUNJA_TOKEN_SETTINGS_PATH } from './constants.ts'
import { vikunjaConnectInfoSchema } from './schema.ts'

import type { VikunjaConnectInfo } from '@/background/vikunja/messages.ts'
import type { ConnectFormProps, IntegrationErrorKey } from '@/widgets/Todo/integrations/types.ts'
import type { VikunjaConfig } from '@/widgets/Todo/store/store.ts'
import type { FormEvent } from 'react'

/** Inline messages this form owns, under `integrations.vikunja.connect.*`. */
type LocalMessageKey = 'invalidUrl' | 'httpsOnly' | 'permissionDenied'

type UrlCheck =
  | { ok: true; baseUrl: string; pattern: string }
  | { ok: false; key: Exclude<LocalMessageKey, 'permissionDenied'> }

/** Ties the message to both inputs for screen readers. */
const MESSAGE_ID = 'vikunja-connect-message'

/**
 * Splits "not a URL at all" from "a URL, but not https" so the user gets the
 * message that actually tells them what to change. The canonical form and the
 * match pattern both come from the bridge's shared helpers, so what this form
 * persists is byte-identical to what the worker will accept — and a wildcard
 * host (`https://*`, `https://*.example.com`) is refused here rather than
 * becoming a permission request for every site the user has.
 */
function checkInstanceUrl(raw: string): UrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, key: 'invalidUrl' }
  }
  if (url.protocol !== 'https:') return { ok: false, key: 'httpsOnly' }

  const baseUrl = normalizeVikunjaBaseUrl(raw)
  const pattern = baseUrl === null ? null : vikunjaHostPattern(baseUrl)
  if (baseUrl === null || pattern === null) return { ok: false, key: 'invalidUrl' }

  return { ok: true, baseUrl, pattern }
}

/**
 * Connect step for a self-hosted Vikunja, in two stages.
 *
 * **Stage 1 — probe.** The host the extension will talk to is unknown at build
 * time, so the manifest only declares `optional_host_permissions`. Chrome
 * grants an optional origin exclusively from inside a user gesture, which is
 * why `chrome.permissions.request` is fired **synchronously** in the submit
 * handler, before any `await`. Everything asynchronous (the bridge call)
 * happens afterwards, on the promise that call returned.
 *
 * **Stage 2 — confirm.** The probe's answer is shown here rather than handed
 * straight to the store, because `onConnect` persists the integration and the
 * dialog immediately advances to the scope step: a "Connected as …" line
 * rendered at that moment would never be read. The user presses Continue once
 * they have seen who they connected as.
 */
export function VikunjaConnectForm({ busy, errorKey, onConnect }: ConnectFormProps) {
  const { t } = useTranslation('todoWidget')
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [localKey, setLocalKey] = useState<LocalMessageKey | null>(null)
  const [bridgeErrorKey, setBridgeErrorKey] = useState<IntegrationErrorKey | null>(null)
  const [probe, setProbe] = useState<VikunjaConnectInfo | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const disabled = busy || submitting
  const canSubmit = url.trim().length > 0 && token.trim().length > 0 && !disabled

  /**
   * One slot, one message. Local validation wins over a worker error, which
   * wins over whatever the store is still showing from a previous attempt —
   * otherwise three stacked paragraphs would compete to explain the same
   * failure.
   */
  const message = localKey
    ? t(`integrations.vikunja.connect.${localKey}`)
    : bridgeErrorKey
      ? t(`integrations.errors.${bridgeErrorKey}`)
      : errorKey
        ? t(`integrations.errors.${errorKey}`)
        : null

  // The help link points at the user's own instance; until the URL parses
  // there is nowhere to point, so the form falls back to prose.
  const tokenSettingsUrl = useMemo(() => {
    const trimmed = url.trim()
    if (!trimmed) return null
    const base = normalizeVikunjaBaseUrl(trimmed)
    return base === null ? null : `${base}${VIKUNJA_TOKEN_SETTINGS_PATH}`
  }, [url])

  /** Editing the credentials invalidates the probe they produced. */
  const resetProbe = () => {
    setProbe(null)
    setLocalKey(null)
    setBridgeErrorKey(null)
  }

  const runProbe = async (grant: Promise<boolean>, baseUrl: string, apiToken: string) => {
    setSubmitting(true)
    try {
      // A rejected request (a prompt the user dismissed, a pattern Chrome
      // cannot represent) reads the same as a refusal: nothing was granted.
      const granted = await grant.catch(() => false)
      if (!granted) {
        setLocalKey('permissionDenied')
        return
      }

      const response = await sendVikunjaMessage<unknown>({
        type: 'vikunja',
        op: 'connect',
        cfg: { baseUrl, token: apiToken },
      })
      if (!response.ok) {
        setBridgeErrorKey(response.errorKey)
        return
      }

      const info = vikunjaConnectInfoSchema.safeParse(response.value)
      if (!info.success) {
        setBridgeErrorKey('unknown')
        return
      }

      setProbe(info.data)
    } finally {
      setSubmitting(false)
    }
  }

  const handleContinue = async (baseUrl: string, apiToken: string) => {
    setSubmitting(true)
    try {
      // No second probe from here. The store's `connectIntegration` runs
      // `connect` once more through the adapter — one extra round trip to
      // `/info` + `/user` that we accept, because it keeps the store the
      // single owner of persistence.
      await onConnect({
        baseUrl,
        token: apiToken,
        // No board yet: the picker step is what adds the first one, and an
        // empty list is what keeps the user on it.
        boards: [],
        defaultProjectId: null,
      } satisfies VikunjaConfig)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    const check = checkInstanceUrl(url.trim())
    if (!check.ok) {
      setProbe(null)
      setBridgeErrorKey(null)
      setLocalKey(check.key)
      return
    }

    if (probe) {
      void handleContinue(check.baseUrl, token.trim())
      return
    }

    setLocalKey(null)
    setBridgeErrorKey(null)

    const permissions = getChromeObject()?.permissions
    if (!permissions?.request) {
      setBridgeErrorKey('permissionMissing')
      return
    }

    // Synchronous, inside the gesture. `Promise.resolve` normalises the MV3
    // promise form without adding an await before the call itself.
    let grant: Promise<boolean>
    try {
      grant = Promise.resolve(permissions.request({ origins: [check.pattern] }))
    } catch {
      setBridgeErrorKey('permissionMissing')
      return
    }

    void runProbe(grant, check.baseUrl, token.trim())
  }

  // The button follows the probe; the confirmation line additionally yields
  // to any message, so a success and a failure never share the screen.
  const probed = probe !== null
  const showConnected = probe !== null && message === null
  const outdated = showConnected && !isTestedVikunjaVersion(probe.version)

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <Field>
        <FieldLabel htmlFor="vikunja-url">{t('integrations.vikunja.connect.urlLabel')}</FieldLabel>
        <Input
          id="vikunja-url"
          // Deliberately `text`, not `url`: native constraint validation
          // would block the submit before `handleSubmit` runs and replace our
          // own `invalidUrl` / `httpsOnly` wording with a browser bubble.
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-describedby={message ? MESSAGE_ID : undefined}
          placeholder={t('integrations.vikunja.connect.urlPlaceholder')}
          value={url}
          onChange={(event) => {
            setUrl(event.target.value)
            resetProbe()
          }}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="vikunja-token">
          {t('integrations.vikunja.connect.tokenLabel')}
        </FieldLabel>
        <Input
          id="vikunja-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-describedby={message ? MESSAGE_ID : undefined}
          value={token}
          onChange={(event) => {
            setToken(event.target.value)
            resetProbe()
          }}
        />
      </Field>

      {tokenSettingsUrl ? (
        <a
          href={tokenSettingsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ExternalLinkIcon className="size-3.5" />
          {t('integrations.vikunja.connect.helpLinkLabel')}
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('integrations.vikunja.connect.helpText')}
        </p>
      )}

      {message && (
        <p id={MESSAGE_ID} role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}

      {showConnected && probe && (
        <p className="text-sm text-muted-foreground">
          {t('integrations.vikunja.connect.connectedAs', {
            user: probe.userHandle,
            version: probe.version,
          })}
        </p>
      )}

      {outdated && (
        <p className="text-sm text-muted-foreground">
          {t('integrations.vikunja.connect.versionWarning')}
        </p>
      )}

      <Button type="submit" disabled={!canSubmit}>
        {t(
          probed ? 'integrations.vikunja.connect.continue' : 'integrations.vikunja.connect.submit',
        )}
      </Button>
    </form>
  )
}
