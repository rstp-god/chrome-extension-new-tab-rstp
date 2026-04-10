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

/**
 * Connect step. Looks up the chosen integration's descriptor and renders its
 * `ConnectForm`. The store action takes care of validating credentials and
 * setting `errorKey` on failure — we just plumb the form's events through.
 */
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
    // The integration name is hard-coupled to its config shape — we cast at
    // the boundary because the descriptor surface is intentionally `unknown`.
    if (integrationName === 'trello') {
      await connectIntegration('trello', config as TrelloConfig)
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
