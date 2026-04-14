import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { hexToOklch, oklchToHex } from '@/utils/color.ts'
import { useEffect, useState } from 'react'

interface Props {
  label: string
  value: string // oklch string
  onChange: (oklch: string) => void
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function ColorInput({ label, value, onChange }: Props) {
  const [hex, setHex] = useState(() => oklchToHex(value))

  useEffect(() => {
    setHex(oklchToHex(value))
  }, [value])

  const commitHex = (next: string) => {
    if (!HEX_RE.test(next)) return
    onChange(hexToOklch(next))
  }

  return (
    <div className="flex items-center gap-3">
      <Label className="w-20 shrink-0 text-xs text-muted-foreground">{label}</Label>
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          const next = e.target.value
          setHex(next)
          commitHex(next)
        }}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
      />
      <Input
        value={hex}
        onChange={(e) => {
          const next = e.target.value
          setHex(next)
          commitHex(next)
        }}
        className="h-8 flex-1 font-mono text-xs"
        spellCheck={false}
      />
    </div>
  )
}
