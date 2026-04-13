import type { ChromeGroupColor, MatcherType } from '@/popup/types/rules.ts'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ColorDot, ColorPicker } from '@/popup/components/ColorPicker.tsx'
import { useTabRulesStore } from '@/popup/store/tabRules.ts'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

const MATCH_TYPES: { value: MatcherType; labelKey: string }[] = [
  { value: 'domain', labelKey: 'rules.form.matchType.domain' },
  { value: 'regex', labelKey: 'rules.form.matchType.regex' },
  { value: 'title_contains', labelKey: 'rules.form.matchType.title_contains' },
  { value: 'path_contains', labelKey: 'rules.form.matchType.path_contains' },
]

interface AddRuleFormProps {
  onClose: () => void
}

export function AddRuleForm({ onClose }: AddRuleFormProps) {
  const { t } = useTranslation('tabRules')
  const addRule = useTabRulesStore((s) => s.addRule)
  const rules = useTabRulesStore((s) => s.rules)

  const existingGroups = useMemo(() => {
    const seen = new Map<string, ChromeGroupColor>()
    for (const rule of rules) {
      if (!seen.has(rule.group.name)) {
        seen.set(rule.group.name, rule.group.color)
      }
    }
    return [...seen.entries()].map(([name, color]) => ({ name, color }))
  }, [rules])

  const [matchType, setMatchType] = useState<MatcherType>('domain')
  const [matchValue, setMatchValue] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupColor, setGroupColor] = useState<ChromeGroupColor>('blue')

  const placeholderKey = `rules.form.matchValue.placeholder.${matchType}`

  const handleSave = () => {
    if (!matchValue.trim() || !groupName.trim()) return

    addRule({
      enabled: true,
      matcher: { type: matchType, value: matchValue.trim() },
      group: { name: groupName.trim(), color: groupColor },
    })

    onClose()
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/35 bg-card p-3">
      <h3 className="text-sm font-bold">{t('rules.form.title')}</h3>

      <div className="space-y-1.5">
        <Label className="text-[11px]">{t('rules.form.matchType')}</Label>
        <Select value={matchType} onValueChange={(v) => setMatchType(v as MatcherType)}>
          <SelectTrigger className="h-8 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MATCH_TYPES.map((mt) => (
              <SelectItem key={mt.value} value={mt.value}>
                {t(mt.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px]">{t('rules.form.matchValue')}</Label>
        <Input
          className="h-8 text-[13px]"
          placeholder={t(placeholderKey)}
          value={matchValue}
          onChange={(e) => setMatchValue(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px]">{t('rules.form.groupName')}</Label>
        {existingGroups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {existingGroups.map((g) => (
              <button
                key={g.name}
                type="button"
                onClick={() => {
                  setGroupName(g.name)
                  setGroupColor(g.color)
                }}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  groupName === g.name
                    ? 'border-primary bg-primary/15 text-foreground'
                    : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                <ColorDot color={g.color} />
                {g.name}
              </button>
            ))}
          </div>
        )}
        <Input
          className="h-8 text-[13px]"
          placeholder={t('rules.form.groupName.placeholder')}
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px]">{t('rules.form.groupColor')}</Label>
        <ColorPicker value={groupColor} onChange={setGroupColor} />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t('rules.form.cancel')}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!matchValue.trim() || !groupName.trim()}>
          {t('rules.form.save')}
        </Button>
      </div>
    </div>
  )
}
