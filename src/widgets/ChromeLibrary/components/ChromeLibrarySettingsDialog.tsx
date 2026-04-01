import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { ChromeLibraryViewMode } from '@/widgets/ChromeLibrary/types/types.ts'

interface Props {
  open: boolean
  viewMode: ChromeLibraryViewMode
  title: string
  description: string
  sectionedLabel: string
  combinedLabel: string
  closeLabel: string
  onOpenChange: (open: boolean) => void
  onSwitchMode: (mode: ChromeLibraryViewMode) => void
}

export function ChromeLibrarySettingsDialog({
  open,
  viewMode,
  title,
  description,
  sectionedLabel,
  combinedLabel,
  closeLabel,
  onOpenChange,
  onSwitchMode,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Button
            type="button"
            variant={viewMode === 'sectioned' ? 'default' : 'outline'}
            onClick={() => onSwitchMode('sectioned')}
          >
            {sectionedLabel}
          </Button>
          <Button
            type="button"
            variant={viewMode === 'combined' ? 'default' : 'outline'}
            onClick={() => onSwitchMode('combined')}
          >
            {combinedLabel}
          </Button>
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {closeLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
