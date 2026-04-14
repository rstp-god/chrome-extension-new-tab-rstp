import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { hexToOklch, oklchToHex } from '@/utils/color.ts'
import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  value: string // oklch string (the canonical form in the store)
  onChange: (oklch: string) => void
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function ColorInput({ label, value, onChange }: Props) {
  // Local hex mirrors the store's oklch. We need the mirror (rather than
  // deriving on every render) so the user can type partial hex like "#33"
  // without the input snapping back.
  const [hex, setHex] = useState(() => oklchToHex(value))

  // Guard: don't re-sync from prop when we're the one who just committed it.
  // Without this, oklchToHex(hexToOklch(userHex)) can differ by one RGB step
  // on some colors and overwrite what the user just typed.
  const selfCommitRef = useRef(false)

  useEffect(() => {
    if (selfCommitRef.current) {
      selfCommitRef.current = false
      return
    }
    setHex(oklchToHex(value))
  }, [value])

  const handleColorChange = (next: string) => {
    setHex(next)
    if (!HEX_RE.test(next)) return
    selfCommitRef.current = true
    onChange(hexToOklch(next))
  }

  return (
    <div className="flex items-center gap-3">
      <Label className="w-20 shrink-0 text-xs text-muted-foreground">{label}</Label>
      <input
        type="color"
        value={hex}
        onChange={(e) => handleColorChange(e.target.value)}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
      />
      <Input
        value={hex}
        onChange={(e) => handleColorChange(e.target.value)}
        className="h-8 flex-1 font-mono text-xs"
        spellCheck={false}
      />
    </div>
  )
}
