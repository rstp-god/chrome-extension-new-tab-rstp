import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils.ts'
import { TestId } from '@tests/constants/testIds.ts'

export interface ProductivityNumberProps {
  /** Already-localized metric label, e.g. "CLOSED" */
  label: string
  /** Today's value for this metric (a non-negative integer) */
  value: number
  /** The personal-baseline median for this metric (may be fractional, or null) */
  baseline: number | null
  /** True while there is not enough history to show a delta */
  coldStart: boolean
  /** Already-localized comparison phrase, e.g. "to weekday avg" */
  comparisonLabel: string
  className?: string
}

/**
 * Дискриминированная форма того, что должно показаться в строке-дельте.
 * UI-слой просто разбирает по `kind` — никакой логики сравнения там нет.
 */
type DeltaPresentation =
  | { kind: 'cold' }
  | { kind: 'unknown' }
  | { kind: 'asUsual' }
  | { kind: 'positive'; magnitude: string }
  | { kind: 'negative'; magnitude: string }

/**
 * Formats a delta magnitude: strips trailing ".0" so integers show cleanly.
 * e.g. 3 → "3", 3.5 → "3.5", 3.0 → "3"
 */
function formatMagnitude(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '')
}

/**
 * Pure: всё, что нужно знать UI, чтобы отрисовать строку-дельту, в одной
 * функции. `value`/`baseline` сюда уже приходят как «сегодня» и «медиана».
 */
function describeDelta(
  value: number,
  baseline: number | null,
  coldStart: boolean,
): DeltaPresentation {
  if (coldStart) return { kind: 'cold' }
  if (baseline === null) return { kind: 'unknown' }
  const delta = value - baseline
  if (delta === 0) return { kind: 'asUsual' }
  const magnitude = formatMagnitude(Math.abs(delta))
  return delta > 0 ? { kind: 'positive', magnitude } : { kind: 'negative', magnitude }
}

export function ProductivityNumber({
  label,
  value,
  baseline,
  coldStart,
  comparisonLabel,
  className,
}: ProductivityNumberProps) {
  const { t } = useTranslation('productivityWidget')
  const presentation = describeDelta(value, baseline, coldStart)

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-xs uppercase tracking-wider opacity-60">{label}</span>
      <span className="tabular-nums text-4xl font-bold leading-none">{value}</span>
      <div className="mt-0.5 min-h-[1rem]">
        <DeltaLine presentation={presentation} comparisonLabel={comparisonLabel} t={t} />
      </div>
    </div>
  )
}

interface DeltaLineProps {
  presentation: DeltaPresentation
  comparisonLabel: string
  t: (key: string) => string
}

function DeltaLine({ presentation, comparisonLabel, t }: DeltaLineProps) {
  switch (presentation.kind) {
    case 'cold':
      return (
        <span className="text-xs opacity-40" data-testid={TestId.ProductivityDeltaColdStart}>
          {t('coldStart')}
        </span>
      )
    case 'unknown':
      // Preserve card height with a non-breaking space
      return <span className="text-xs">&nbsp;</span>
    case 'positive':
      return (
        <span className="text-xs text-emerald-500" data-testid={TestId.ProductivityDeltaPositive}>
          +{presentation.magnitude} {comparisonLabel}
        </span>
      )
    case 'negative':
      return (
        <span className="text-xs text-rose-500" data-testid={TestId.ProductivityDeltaNegative}>
          {/* U+2212 MINUS SIGN */}−{presentation.magnitude} {comparisonLabel}
        </span>
      )
    case 'asUsual':
      return (
        <span className="text-xs opacity-40" data-testid={TestId.ProductivityDeltaAsUsual}>
          {t('delta.asUsual')}
        </span>
      )
  }
}
