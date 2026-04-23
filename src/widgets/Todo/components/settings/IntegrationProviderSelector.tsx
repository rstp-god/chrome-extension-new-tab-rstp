import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { TodoIntegrationType } from '@/widgets/Todo/utils/settings.ts'
import { useTranslation } from 'react-i18next'

interface Props {
  activeIntegration: TodoIntegrationType
  onSelect: (integration: TodoIntegrationType) => void
}

export function IntegrationProviderSelector({ activeIntegration, onSelect }: Props) {
  const { t } = useTranslation('todoWidget')

  return (
    <Card size="sm" className="border border-border bg-transparent">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-sm">{t('settings.providerLabel')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant={activeIntegration === 'trello' ? 'default' : 'outline'}
          className="h-auto w-full justify-start px-3 py-2 text-left"
          onClick={() => onSelect('trello')}
        >
          <span className="block text-sm font-medium">{t('settings.providerTrello')}</span>
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('settings.integrationTrelloDescription')}
        </p>
      </CardContent>
    </Card>
  )
}
