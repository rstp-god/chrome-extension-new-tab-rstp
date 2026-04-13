import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

interface SectionCardProps {
  title: string
  children: ReactNode
  toggle?: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
  }
}

export function SectionCard({ title, children, toggle }: SectionCardProps) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        {toggle && (
          <Switch checked={toggle.checked} onCheckedChange={toggle.onCheckedChange} size="sm" />
        )}
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3 pt-0">{children}</CardContent>
    </Card>
  )
}
