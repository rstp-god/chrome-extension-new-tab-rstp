import { normalizeVikunjaBaseUrl, vikunjaHostPattern } from '@/background/vikunja/messages.ts'
import type { VikunjaConnectInfo } from '@/background/vikunja/messages.ts'
import { Button } from '@/components/ui/button.tsx'
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { getChromeObject } from '@/services/chrome/runtime.ts'
import type { ConnectFormProps, IntegrationErrorKey } from '@/widgets/Todo/integrations/types.ts'
import type { VikunjaConfig } from '@/widgets/Todo/store/store.ts'
import { ExternalLinkIcon } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { sendVikunjaMessage } from './bridge.ts'
import { VIKUNJA_SUPPORTED_VERSION_PREFIX, VIKUNJA_TOKEN_SETTINGS_PATH } from './constants.ts'
import { vikunjaConnectInfoSchema } from './schema.ts'

/** Inline messages this form owns, under `integrations.vikunja.connect.*`. */
type LocalMessageKey = 'invalidUrl' | 'httpsOnly' | 'permissionDenied'

type UrlCheck =
  | { ok: true; baseUrl: string; pattern: string }
  | { ok: false; key: Exclude<LocalMessageKey, 'permissionDenied'> }

/**
 * Splits "not a URL at all" from "a URL, but not https" so the user gets the
 * message that actually tells them what to change. The canonical form and the
 * match pattern both come from the bridge's shared helpers, so what this form
 * persists is byte-identical to what the worker will accept.
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
 * Connect step for a self-hosted Vikunja.
 *
 * The host the extension will talk to is unknown at build time, so the
 * manifest only declares `optional_host_permissions`. Chrome grants an
 * optional origin exclusively from inside a user gesture, which is why
 * `chrome.permissions.request` is fired **synchronously** in the submit
 * handler — before any `await`. Every asynchronous step (the bridge call,
 * the store write) happens afterwards, on the promise that call returned.
 */
export function VikunjaConnectForm({ busy, errorKey, onConnect }: ConnectFormProps) {
  const { t } = useTranslation('todoWidget')
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [localKey, setLocalKey] = useState<LocalMessageKey | null>(null)
  const [bridgeErrorKey, setBridgeErrorKey] = useState<IntegrationErrorKey | null>(null)
  const [connected, setConnected] = useState<VikunjaConnectInfo | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const disabled = busy || submitting
  const canSubmit = url.trim().length > 0 && token.trim().length > 0 && !disabled

  // The help link points at the user's own instance; until the URL parses
  // there is nowhere to point, so the form falls back to prose.
  const tokenSettingsUrl = useMemo(() => {
    const trimmed = url.trim()
    if (!trimmed) return null
    const base = normalizeVikunjaBaseUrl(trimmed)
    return base === null ? null : `${base}${VIKUNJA_TOKEN_SETTINGS_PATH}`
  }, [url])

  const finish = async (grant: Promise<boolean>, baseUrl: string, apiToken: string) => {
    setSubmitting(true)
    try {
      // A rejected request (an unrepresentable pattern, a closed prompt)
      // reads the same as a refusal: nothing was granted.
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

      setConnected(info.data)
      // The store's `connectIntegration` runs `connect` once more through the
      // adapter. That is a second round trip to `/info` + `/user` and we
      // accept it: it keeps the store the single owner of persistence, and
      // both calls are cheap next to the permission prompt the user just saw.
      await onConnect({
        baseUrl,
        token: apiToken,
        projectId: null,
        viewId: null,
        kanbanMapping: true,
      } satisfies VikunjaConfig)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setLocalKey(null)
    setBridgeErrorKey(null)
    setConnected(null)

    const check = checkInstanceUrl(url.trim())
    if (!check.ok) {
      setLocalKey(check.key)
      return
    }

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

    void finish(grant, check.baseUrl, token.trim())
  }

  const outdated =
    connected !== null && !connected.version.startsWith(VIKUNJA_SUPPORTED_VERSION_PREFIX)

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
          placeholder={t('integrations.vikunja.connect.urlPlaceholder')}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
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
          value={token}
          onChange={(event) => setToken(event.target.value)}
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

      {localKey && (
        <p className="text-sm text-destructive">{t(`integrations.vikunja.connect.${localKey}`)}</p>
      )}

      {bridgeErrorKey && (
        <p className="text-sm text-destructive">{t(`integrations.errors.${bridgeErrorKey}`)}</p>
      )}

      {errorKey && (
        <p className="text-sm text-destructive">{t(`integrations.errors.${errorKey}`)}</p>
      )}

      {connected && (
        <p className="text-sm text-muted-foreground">
          {t('integrations.vikunja.connect.connectedAs', {
            user: connected.userHandle,
            version: connected.version,
          })}
        </p>
      )}

      {outdated && (
        <p className="text-sm text-muted-foreground">
          {t('integrations.vikunja.connect.versionWarning')}
        </p>
      )}

      <Button type="submit" disabled={!canSubmit}>
        {t('integrations.vikunja.connect.submit')}
      </Button>
    </form>
  )
}
