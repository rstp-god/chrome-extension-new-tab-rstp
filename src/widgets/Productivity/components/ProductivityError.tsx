import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { TestId } from '@tests/constants/testIds.ts'

interface ProductivityErrorProps {
  onRetry: () => void
}

/** Error-стейт виджета: вынесен из основного компонента ради читаемости. */
export function ProductivityError({ onRetry }: ProductivityErrorProps) {
  const { t } = useTranslation('productivityWidget')

  return (
    <Card className="h-full" data-testid={TestId.ProductivityWidgetError}>
      <CardContent className="flex flex-col items-center gap-3 pt-6">
        <p className="text-sm text-muted-foreground">{t('error.message')}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('error.retry')}
        </Button>
      </CardContent>
    </Card>
  )
}
