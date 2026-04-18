import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { ChartPalettePicker } from '@/components/compiled/ChartPalettePicker.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import { Slider } from '@/components/ui/slider.tsx'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import type { ScreenTimeChartType, ScreenTimeSettings } from '@/background/activity/types.ts'
import { SCREEN_TIME_CHART_TYPES } from '@/background/activity/types.ts'
import { useActivityStore } from '@/store/activity.ts'
import { ToggleRow } from '@/widgets/ScreenTime/components/settings/ToggleRow.tsx'
import { TestId } from '@tests/constants/testIds.ts'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Boolean flags surfaced as toggles; labels resolve via `settings.<field>` i18n key. */
const DISPLAY_TOGGLES = [
  'showTopDomains',
  'showYAxis',
  'showGrid',
  'showTooltips',
] as const satisfies readonly (keyof ScreenTimeSettings)[]

export function ScreenTimeSettingsDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation('screenTimeWidget')
  const { screenTime, update } = useActivityStore(
    useShallow((s) => ({
      screenTime: s.screenTime,
      update: s.updateScreenTimeSettings,
    })),
  )

  const paletteLabels = {
    description: t('settings.chartPaletteDescription'),
    preview: t('settings.chartPalettePreview'),
    hex: t('settings.hex'),
    pickColor: t('settings.pickColor'),
    presets: {
      default: t('settings.presets.default'),
      ocean: t('settings.presets.ocean'),
      forest: t('settings.presets.forest'),
      sunset: t('settings.presets.sunset'),
      lavender: t('settings.presets.lavender'),
      mono: t('settings.presets.mono'),
    },
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid={TestId.ScreenTimeSettingsDialog}>
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">{t('settings.chartType')}</Label>
            <ToggleGroup
              type="single"
              value={screenTime.chartType}
              onValueChange={(v) => v && update({ chartType: v as ScreenTimeChartType })}
              variant="outline"
              size="sm"
              spacing={0}
            >
              {SCREEN_TIME_CHART_TYPES.map((type) => (
                <ToggleGroupItem key={type} value={type} className="text-xs">
                  {t(`settings.chartTypes.${type}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">{t('settings.chartPalette')}</Label>
            <ChartPalettePicker
              value={screenTime.chartPalette}
              onChange={(next) => update({ chartPalette: next })}
              testIdPrefix={TestId.ScreenTimeChartPalette}
              labels={paletteLabels}
            />
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">{t('settings.display')}</Label>
            {DISPLAY_TOGGLES.map((field) => (
              <ToggleRow
                key={field}
                label={t(`settings.${field}`)}
                checked={screenTime[field] as boolean}
                onChange={(v) => update({ [field]: v })}
              />
            ))}
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">{t('settings.maxDomains')}</Label>
              <span className="font-mono text-xs">{screenTime.maxDomains}</span>
            </div>
            <Slider
              value={[screenTime.maxDomains]}
              min={1}
              max={10}
              step={1}
              onValueChange={([v]) => {
                if (typeof v === 'number') update({ maxDomains: v })
              }}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
