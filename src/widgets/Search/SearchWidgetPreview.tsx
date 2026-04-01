import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { WidgetFrame } from '@/newtab/components/WidgetLayout/WidgetFrame.tsx'
import { useTranslation } from 'react-i18next'

export function SearchWidgetPreview() {
  const { t } = useTranslation('searchWidget')

  return (
    <WidgetFrame title={t('title')} pinned={false}>
      <form className="flex items-center gap-2" onSubmit={(e) => e.preventDefault()}>
        <Input disabled value="" placeholder={t('placeholder')} />
        <Button disabled type="submit">
          {t('submit')}
        </Button>
      </form>
    </WidgetFrame>
  )
}
