import type { ChromeGroupColor } from '@/popup/types/rules.ts'
import { cn } from '@/lib/utils'

const COLORS: { key: ChromeGroupColor; hex: string }[] = [
  { key: 'grey', hex: '#9AA0A6' },
  { key: 'blue', hex: '#4285F4' },
  { key: 'red', hex: '#EA4335' },
  { key: 'yellow', hex: '#FBBC04' },
  { key: 'green', hex: '#34A853' },
  { key: 'pink', hex: '#E8458B' },
  { key: 'purple', hex: '#A142F4' },
  { key: 'cyan', hex: '#24C1E0' },
]

interface ColorPickerProps {
  value: ChromeGroupColor
  onChange: (color: ChromeGroupColor) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex gap-2">
      {COLORS.map(({ key, hex }) => (
        <button
          key={key}
          type="button"
          aria-label={key}
          className={cn(
            'h-5 w-5 rounded-full transition-all',
            value === key && 'ring-2 ring-white ring-offset-2 ring-offset-background',
          )}
          style={{ backgroundColor: hex }}
          onClick={() => onChange(key)}
        />
      ))}
    </div>
  )
}

export function ColorDot({ color }: { color: ChromeGroupColor }) {
  const hex = COLORS.find((c) => c.key === color)?.hex ?? '#9AA0A6'
  return (
    <span
      className="inline-block h-3 w-3 rounded-full"
      style={{ backgroundColor: hex }}
    />
  )
}
