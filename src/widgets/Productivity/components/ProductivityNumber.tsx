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
 * Formats a delta magnitude: strips trailing ".0" so integers show cleanly.
 * e.g. 3 → "3", 3.5 → "3.5", 3.0 → "3"
 */
function formatMagnitude(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '')
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

  let deltaNode: React.ReactNode

  if (coldStart) {
    deltaNode = (
      <span className="text-xs opacity-40" data-testid={TestId.ProductivityDeltaColdStart}>
        {t('coldStart')}
      </span>
    )
  } else if (baseline === null) {
    // Preserve card height with a non-breaking space
    deltaNode = <span className="text-xs">&nbsp;</span>
  } else {
    const delta = value - baseline
    const magnitude = formatMagnitude(Math.abs(delta))

    if (delta > 0) {
      deltaNode = (
        <span className="text-xs text-emerald-500" data-testid={TestId.ProductivityDeltaPositive}>
          +{magnitude} {comparisonLabel}
        </span>
      )
    } else if (delta < 0) {
      deltaNode = (
        <span className="text-xs text-rose-500" data-testid={TestId.ProductivityDeltaNegative}>
          {/* U+2212 MINUS SIGN */}−{magnitude} {comparisonLabel}
        </span>
      )
    } else {
      deltaNode = (
        <span className="text-xs opacity-40" data-testid={TestId.ProductivityDeltaAsUsual}>
          {t('delta.asUsual')}
        </span>
      )
    }
  }

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-xs uppercase tracking-wider opacity-60">{label}</span>
      <span className="tabular-nums text-4xl font-bold leading-none">{value}</span>
      <div className="mt-0.5 min-h-[1rem]">{deltaNode}</div>
    </div>
  )
}
