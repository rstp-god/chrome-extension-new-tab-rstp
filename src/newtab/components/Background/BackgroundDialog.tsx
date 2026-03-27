import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import {
  IMG_HEIGHT,
  IMG_QUALITY,
  IMG_WIDTH,
} from '@/newtab/components/Background/constants/constants.ts'
import {
  buildPreviewStyle,
  clearBackground,
  saveBackgroundFromFile,
} from '@/newtab/components/Background/services/loadImages'
import { processImageToWebp } from '@/newtab/components/Background/services/webpConverter.ts'
import { assertImageFile } from '@/newtab/components/Background/utils/fileUpload.ts'
import type { BackgroundStateV1 } from '@/types/background'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  value: BackgroundStateV1
  onSaved: (next: BackgroundStateV1) => Promise<void> | void

  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BackgroundDialog({ value, onSaved, open, onOpenChange }: Props) {
  const { t } = useTranslation('backgroundDialog')
  const { t: common } = useTranslation('common')

  const [draft, setDraft] = useState<BackgroundStateV1>(value)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setDraft(value)
      setFile(null)
      setPreviewUrl(null)
      setError(null)
    }
  }, [open, value])

  const onPick = async (f: File | null) => {
    setError(null)
    setFile(f)
    setPreviewUrl(null)

    if (!f) return

    try {
      assertImageFile(f, 30)
      const url = await processImageToWebp(f, {
        maxWidth: IMG_WIDTH,
        maxHeight: IMG_HEIGHT,
        quality: IMG_QUALITY,
      })
      setPreviewUrl(url.dataUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorInvalidImage'))
      setFile(null)
      setPreviewUrl(null)
    }
  }

  const onSave = async () => {
    setSaving(true)
    setError(null)

    try {
      let next: BackgroundStateV1

      if (file) {
        next = await saveBackgroundFromFile({
          file,
          current: {
            ...value,
            dim: draft.dim,
            blur: draft.blur,
            saturate: draft.saturate,
          },
          maxMb: 30,
        })
      } else {
        // TODO: rm ERROR throw, add save prev file from storage
        throw new Error(t('chooseFileToSave'))
      }

      await onSaved(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorSave'))
    } finally {
      setSaving(false)
    }
  }

  const onClear = async () => {
    setSaving(true)
    setError(null)

    try {
      const next = await clearBackground({
        current: {
          ...value,
          dim: draft.dim,
          blur: draft.blur,
          saturate: draft.saturate,
        },
      })
      await onSaved(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorClear'))
    } finally {
      setSaving(false)
    }
  }

  const dimPct = Math.round(draft.dim * 100)
  const satPct = Math.round(draft.saturate * 100)

  const previewStyle = buildPreviewStyle({
    dataUrl: previewUrl,
    dim: draft.dim,
    blur: draft.blur,
    saturate: draft.saturate,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <div className="text-sm text-muted-foreground">{t('uploadHint')}</div>

            <Input
              type="file"
              accept="image/*"
              onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
              disabled={saving}
              className="file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-secondary-foreground"
            />

            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>

          <div className="grid gap-2">
            <div className="text-sm text-muted-foreground">{t('preview')}</div>

            <div className="relative overflow-hidden rounded-2xl border border-border bg-muted">
              <div className="h-40 w-full" style={previewStyle} />
              {!previewUrl && (
                <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                  {t('previewPlaceholder')}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between">
                <div className="text-sm text-muted-foreground">{t('dim')}</div>
                <div className="text-xs text-muted-foreground">{dimPct}%</div>
              </div>
              <Slider
                value={[dimPct]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => setDraft((p) => ({ ...p, dim: v[0] / 100 }))}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-baseline justify-between">
                <div className="text-sm text-muted-foreground">{t('blur')}</div>
                <div className="text-xs text-muted-foreground">{Math.round(draft.blur)}px</div>
              </div>
              <Slider
                value={[Math.round(draft.blur)]}
                min={0}
                max={40}
                step={1}
                onValueChange={(v) => setDraft((p) => ({ ...p, blur: v[0] }))}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-baseline justify-between">
                <div className="text-sm text-muted-foreground">{t('saturate')}</div>
                <div className="text-xs text-muted-foreground">{satPct}%</div>
              </div>
              <Slider
                value={[satPct]}
                min={50}
                max={200}
                step={1}
                onValueChange={(v) => setDraft((p) => ({ ...p, saturate: v[0] / 100 }))}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={saving}>
                {common('close')}
              </Button>
            </DialogClose>

            <Button variant="outline" onClick={onClear} disabled={saving}>
              {common('clear')}
            </Button>

            <Button onClick={onSave} disabled={!file || saving}>
              {saving ? common('saving') : common('save')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
