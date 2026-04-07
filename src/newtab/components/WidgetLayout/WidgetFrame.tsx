import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { testIds } from '@tests/constants/testIds.ts'
import { GripVerticalIcon, XIcon } from 'lucide-react'
import { ReactNode } from 'react'

interface Props {
  title: string
  widgetType?: string
  children: ReactNode
  pinned: boolean
  onRemove?: () => void
}

export function WidgetFrame({ title, widgetType, children, pinned, onRemove }: Props) {
  return (
    <Card
      className="flex h-full min-h-0 flex-col"
      data-testid={widgetType ? testIds.widgetFrame(widgetType) : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        {pinned && (
          <div className="flex items-center">
            <Button
              data-testid={widgetType ? testIds.widgetRemove(widgetType) : undefined}
              className="cursor-pointer"
              size="sm"
              variant="ghost"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onRemove?.()
              }}
            >
              <XIcon color="red" />{' '}
            </Button>
            <div
              className="handle cursor-grab select-none text-muted-foreground"
              data-testid={widgetType ? testIds.widgetDrag(widgetType) : undefined}
            >
              <GripVerticalIcon className="size-4" />
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent
        className="flex min-h-0 flex-1 flex-col"
        data-testid={widgetType ? testIds.widgetContent(widgetType) : undefined}
      >
        {children}
      </CardContent>
    </Card>
  )
}
