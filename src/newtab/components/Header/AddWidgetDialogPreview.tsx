import { Card, CardContent } from '@/components/ui/card.tsx'
import { TestId } from '@tests/constants/testIds.ts'
import { WidgetModule } from '@/types/widgets.ts'

interface Props {
  className?: string
  description: string
  previewComingSoonLabel: string
  templatePreviewLabel: string
  title: string
  widget: Pick<WidgetModule, 'PreviewComponent'> | null
}

export function AddWidgetDialogPreview({
  className,
  description,
  previewComingSoonLabel,
  templatePreviewLabel,
  title,
  widget,
}: Props) {
  if (!widget) return null

  const PreviewComponent = widget.PreviewComponent

  return (
    <div className={className} data-testid={TestId.AddWidgetPreview}>
      <div className="space-y-2 pb-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
          {templatePreviewLabel}
        </div>
        <div className="text-base font-medium" data-testid={TestId.AddWidgetPreviewTitle}>
          {title}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-h-0 flex-1">
        {PreviewComponent ? (
          <PreviewComponent />
        ) : (
          <Card className="justify-center rounded-[2rem] border border-dashed border-border/80 bg-background/70">
            <CardContent className="space-y-2 py-10 text-center">
              <div className="font-medium">{title}</div>
              <div className="text-sm text-muted-foreground">{previewComingSoonLabel}</div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
