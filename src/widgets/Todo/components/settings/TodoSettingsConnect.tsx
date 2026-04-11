import { Button } from '@/components/ui/button.tsx'
import {
  getIntegrationDescriptor,
  type ConnectFormProps,
} from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore, type TrelloConfig } from '@/widgets/Todo/store/store.ts'
import { ChevronLeftIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  integrationName: string
  onBack: () => void
}

export function TodoSettingsConnect({ integrationName, onBack }: Props) {
  const { t } = useTranslation('todoWidget')
  const connectIntegration = useTodoStore((state) => state.connectIntegration)
  const errorKey = useTodoStore((state) => state.errorKey)
  const loading = useTodoStore((state) => state.loading)

  const descriptor = getIntegrationDescriptor(integrationName)
  if (!descriptor) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-destructive">{t('integrations.trello.errors.unknown')}</p>
        <Button type="button" variant="outline" onClick={onBack}>
          <ChevronLeftIcon className="size-4" />
          {t('integrations.trello.board.back')}
        </Button>
      </div>
    )
  }

  const ConnectForm = descriptor.ConnectForm
  const handleConnect: ConnectFormProps['onConnect'] = async (config) => {
    // Per-integration dispatch. Each adapter knows its own config shape, so
    // the cast happens in exactly one place per integration. Once a second
    // backend lands here we can lift this into a typed registry; for now
    // a switch keeps the boundary obvious and exhaustively flagged by ESLint
    // when a new case appears.
    switch (integrationName) {
      case 'trello':
        await connectIntegration('trello', config as TrelloConfig)
        return
      default:
        console.warn(`TodoSettingsConnect: no handler for integration "${integrationName}"`)
    }
  }

  return (
    <div className="grid gap-4">
      <ConnectForm busy={loading} errorKey={errorKey} onConnect={handleConnect} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        disabled={loading}
        className="self-start"
      >
        <ChevronLeftIcon className="size-4" />
        {t('integrations.trello.board.back')}
      </Button>
    </div>
  )
}
