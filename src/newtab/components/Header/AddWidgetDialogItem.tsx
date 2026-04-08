import { Button } from '@/components/ui/button.tsx'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item.tsx'
import { cn } from '@/lib/utils.ts'
import { testIds } from '@tests/constants/testIds.ts'
import { WidgetType } from '@/types/widgets.ts'

interface Props {
  description: string
  isActive: boolean
  title: string
  widgetType: WidgetType
  onAdd: (widgetType: WidgetType) => void
  onHover: (widgetType: WidgetType) => void
  addLabel: string
}

export function AddWidgetDialogItem({
  addLabel,
  description,
  isActive,
  title,
  widgetType,
  onAdd,
  onHover,
}: Props) {
  return (
    <ItemGroup>
      <Item
        data-testid={testIds.addWidgetItem(widgetType)}
        className={cn(
          'rounded-[1.75rem] border-border/70 bg-background/70 transition-all',
          'hover:border-border hover:bg-muted/35',
          isActive ? 'border-primary/30 bg-muted/45 ring-2 ring-primary/15' : 'border-border/70',
        )}
        variant="outline"
        onMouseEnter={() => onHover(widgetType)}
      >
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full text-sm leading-tight">{title}</ItemTitle>
          <ItemDescription className="line-clamp-2 leading-relaxed">{description}</ItemDescription>
        </ItemContent>
        <ItemActions className="shrink-0">
          <Button
            data-testid={testIds.addWidgetButton(widgetType)}
            className="shrink-0"
            variant={isActive ? 'default' : 'secondary'}
            onClick={() => onAdd(widgetType)}
          >
            {addLabel}
          </Button>
        </ItemActions>
      </Item>
    </ItemGroup>
  )
}
