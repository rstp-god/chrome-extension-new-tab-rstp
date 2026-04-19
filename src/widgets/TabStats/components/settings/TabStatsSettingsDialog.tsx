import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import type { TabStatsFormat } from '@/background/activity/types.ts'
import {
  TAB_STATS_FORMATS,
  TAB_STATS_METRIC_KEYS,
} from '@/background/activity/types.ts'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { useActivityStore } from '@/store/activity.ts'
import { ToggleRow } from '@/components/compiled/ToggleRow.tsx'
import { TestId } from '@tests/constants/testIds.ts'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TabStatsSettingsDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation('tabStatsWidget')
  const { tabStats, update } = useActivityStore(
    useShallow((s) => ({
      tabStats: s.tabStats,
      update: s.updateTabStatsSettings,
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
      <DialogContent className="sm:max-w-md" data-testid={TestId.TabStatsSettingsDialog}>
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">{t('settings.format')}</Label>
            <ToggleGroup
              type="single"
              value={tabStats.format}
              onValueChange={(v) => v && update({ format: v as TabStatsFormat })}
              variant="outline"
              size="sm"
              spacing={0}
            >
              {TAB_STATS_FORMATS.map((fmt) => (
                <ToggleGroupItem key={fmt} value={fmt} className="text-xs">
                  {t(`settings.formats.${fmt}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">{t('settings.metrics')}</Label>
            {TAB_STATS_METRIC_KEYS.map((key) => (
              <ToggleRow
                key={key}
                label={t(`metrics.${key}`)}
                checked={tabStats.visibleMetrics[key]}
                onChange={(v) => update({ visibleMetrics: { [key]: v } })}
              />
            ))}
            <ToggleRow
              label={t('settings.showSparkline')}
              checked={tabStats.showSparkline}
              onChange={(v) => update({ showSparkline: v })}
            />
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">
              {t('settings.chartPalette')}
            </Label>
            <ChartPalettePicker
              value={tabStats.chartPalette}
              onChange={(next) => update({ chartPalette: next })}
              testIdPrefix={TestId.TabStatsChartPalette}
              labels={paletteLabels}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
