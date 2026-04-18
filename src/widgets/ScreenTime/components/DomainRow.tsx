import { useTranslation } from 'react-i18next'

import { toHoursMinutes } from '@/widgets/ScreenTime/utils/duration.ts'

interface Props {
  /** Hostname for display. */
  label: string
  /** OKLCH string for the dot indicator. Pass `null` for the neutral "Other" row. */
  color: string | null
  /** Seconds spent on this domain. */
  seconds: number
  /** `data-domain` attribute for testing / DOM queries. */
  dataKey?: string
}

/**
 * Single row inside `ScreenTimeDomainList`: coloured dot + domain label +
 * right-aligned "5h 43m" duration. Extracted so the "Other" row and the
 * regular domain rows share one layout.
 */
export function DomainRow({ label, color, seconds, dataKey }: Props) {
  const { t } = useTranslation('screenTimeWidget')
  const { hours, minutes, subMinute } = toHoursMinutes(seconds)
  const duration = subMinute
    ? t('totalBelowMinute')
    : hours > 0
      ? t('totalHoursMinutes', { hours, minutes })
      : t('totalMinutes', { minutes })

  return (
    <li className="flex items-center justify-between text-xs" data-domain={dataKey}>
      <span className="flex items-center gap-2 truncate">
        <span
          className={
            color
              ? 'inline-block size-2 shrink-0 rounded-full'
              : 'inline-block size-2 shrink-0 rounded-full bg-muted-foreground/50'
          }
          style={color ? { backgroundColor: color } : undefined}
          aria-hidden
        />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 font-mono text-muted-foreground">{duration}</span>
    </li>
  )
}
