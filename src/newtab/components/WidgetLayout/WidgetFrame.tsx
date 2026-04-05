import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { GripVerticalIcon, XIcon } from 'lucide-react'
import { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  pinned: boolean
  onRemove?: () => void
}

export function WidgetFrame({ title, children, pinned, onRemove }: Props) {
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        {pinned && (
          <div className="flex items-center">
            <Button
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
            <div className="handle cursor-grab select-none text-muted-foreground">
              <GripVerticalIcon className="size-4" />
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">{children}</CardContent>
    </Card>
  )
}
