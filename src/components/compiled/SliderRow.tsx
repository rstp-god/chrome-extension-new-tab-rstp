import { Slider } from '@/components/ui/slider.tsx'

interface Props {
  label: string
  value: number
  min: number
  max: number
  step: number
  formatter?: (v: number) => string
  onChange: (v: number) => void
}

/** Label + Slider + formatted value in a single row. Dumb UI glue reused
 * wherever settings expose a numeric knob. */
export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  formatter = (v) => String(v),
  onChange,
}: Props) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
      <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {formatter(value)}
      </span>
    </div>
  )
}
