import { Button } from '@/components/ui/button.tsx'
import {
  getIntegrationDescriptor,
  type ConnectFormProps,
} from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
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
        <p className="text-sm text-destructive">{t('integrations.errors.unknown')}</p>
        <Button type="button" variant="outline" onClick={onBack}>
          <ChevronLeftIcon className="size-4" />
          {t('integrations.trello.board.back')}
        </Button>
      </div>
    )
  }

  const ConnectForm = descriptor.ConnectForm
  // No per-integration dispatch: the config is opaque here and the store
  // validates it against the persisted schema before it goes anywhere.
  const handleConnect: ConnectFormProps['onConnect'] = async (config) => {
    await connectIntegration(integrationName, config)
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
