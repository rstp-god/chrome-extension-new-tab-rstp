import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { XIcon } from 'lucide-react'
import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  title: string
  children: ReactNode
  pinned: boolean
  onRemove?: () => void
}

export function WidgetFrame({ title, children, pinned, onRemove }: Props) {
  const { t: common } = useTranslation('common')

  return (
    <Card className="h-full handle">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        {pinned && (
          <div className="flex items-center">
            <Button className="cursor-pointer" size="sm" variant="ghost" onClick={onRemove}>
              <XIcon color="red" />{' '}
            </Button>
            <div className="cursor-grab select-none text-xs text-muted-foreground mr-0">
              {common('drag')}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
