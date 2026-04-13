import type { GroupingRule } from '@/popup/types/rules.ts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ColorDot } from '@/popup/components/ColorPicker.tsx'
import { MATCHER_LABELS } from '@/popup/types/rules.ts'
import { cn } from '@/lib/utils'
import { GripVertical, Trash2 } from 'lucide-react'

interface RuleItemProps {
  rule: GroupingRule
  onToggle: () => void
  onDelete: () => void
  dragHandleProps?: Record<string, unknown>
}

export function RuleItem({ rule, onToggle, onDelete, dragHandleProps }: RuleItemProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 rounded-lg bg-muted/50 px-2 py-1.5 transition-opacity',
        !rule.enabled && 'opacity-40',
      )}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="cursor-grab opacity-0 transition-opacity group-hover:opacity-100"
              {...dragHandleProps}
            >
              <GripVertical size={14} className="text-muted-foreground" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">Drag to reorder</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Badge variant="outline" className="w-16 shrink-0 justify-center text-[11px] font-medium">
        {MATCHER_LABELS[rule.matcher.type]}
      </Badge>

      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{rule.matcher.value}</span>

      <span className="shrink-0 text-xs text-muted-foreground">{rule.group.name}</span>
      <ColorDot color={rule.group.color} />

      <Switch checked={rule.enabled} onCheckedChange={onToggle} size="sm" />

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={onDelete}
            >
              <Trash2 size={14} className="text-destructive" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete rule</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
