import { Slider } from '@/components/ui/slider.tsx'
import { useAppearanceStore } from '@/store/appearance.ts'
import { TestId } from '@tests/constants/testIds.ts'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

export function CardOpacitySlider() {
  const { t } = useTranslation('settingsDialog')
  const { cardOpacity, setCardOpacity } = useAppearanceStore(
    useShallow((s) => ({ cardOpacity: s.cardOpacity, setCardOpacity: s.setCardOpacity })),
  )

  return (
    <div className="flex flex-col gap-3" data-testid={TestId.AppearanceOpacitySlider}>
      <p className="text-xs text-muted-foreground">{t('cardOpacityDescription')}</p>

      <div className="flex items-center gap-3">
        <span className="w-10 text-xs text-muted-foreground">{t('glass')}</span>
        <Slider
          value={[cardOpacity]}
          min={0.3}
          max={1.0}
          step={0.05}
          onValueChange={(v) => setCardOpacity(v[0] ?? cardOpacity)}
        />
        <span className="w-10 text-xs text-muted-foreground">{t('solid')}</span>
        <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">
          {Math.round(cardOpacity * 100)}%
        </span>
      </div>
    </div>
  )
}
