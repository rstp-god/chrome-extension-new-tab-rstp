import type { ReactNode } from 'react'

interface Props {
  label: string
  value: ReactNode
  secondary: string | null
  /** Visual density — `card` for grid layout, `row` for list layout. */
  variant?: 'card' | 'row'
}

export function MetricCell({ label, value, secondary, variant = 'card' }: Props) {
  if (variant === 'row') {
    return (
      <div className="flex items-baseline justify-between gap-3 py-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="flex items-baseline gap-2">
          <span className="text-lg font-semibold leading-none">{value}</span>
          {secondary && <span className="text-[10px] text-muted-foreground">{secondary}</span>}
        </span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold leading-tight">{value}</span>
      {secondary && <span className="text-[10px] text-muted-foreground">{secondary}</span>}
    </div>
  )
}
