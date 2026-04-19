import { Switch } from '@/components/ui/switch.tsx'

interface Props {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}

export function ToggleRow({ label, checked, onChange }: Props) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
