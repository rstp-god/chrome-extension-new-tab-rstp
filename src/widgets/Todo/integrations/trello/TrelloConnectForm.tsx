import { Button } from '@/components/ui/button.tsx'
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import type { ConnectFormProps } from '@/widgets/Todo/integrations/types.ts'
import { ExternalLinkIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { TRELLO_APP_KEY_URL } from './constants.ts'
import type { TrelloConfig } from './types.ts'

export function TrelloConnectForm({ busy, errorKey, onConnect }: ConnectFormProps) {
  const { t } = useTranslation('todoWidget')
  const [apiKey, setApiKey] = useState('')
  const [token, setToken] = useState('')

  const canSubmit = apiKey.trim().length > 0 && token.trim().length > 0 && !busy

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    const config: TrelloConfig = {
      apiKey: apiKey.trim(),
      token: token.trim(),
      boardId: null,
    }
    onConnect(config)
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <Field>
        <FieldLabel htmlFor="trello-api-key">
          {t('integrations.trello.connect.apiKeyLabel')}
        </FieldLabel>
        <Input
          id="trello-api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="trello-token">
          {t('integrations.trello.connect.tokenLabel')}
        </FieldLabel>
        <Input
          id="trello-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </Field>

      <a
        href={TRELLO_APP_KEY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ExternalLinkIcon className="size-3.5" />
        {t('integrations.trello.connect.helpLinkLabel')}
      </a>

      {errorKey && (
        <p className="text-sm text-destructive">{t(`integrations.trello.errors.${errorKey}`)}</p>
      )}

      <Button type="submit" disabled={!canSubmit}>
        {t('integrations.trello.connect.submit')}
      </Button>
    </form>
  )
}
