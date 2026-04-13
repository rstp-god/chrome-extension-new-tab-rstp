import type { DragEvent } from 'react'

import { Button } from '@/components/ui/button'
import { AddRuleForm } from '@/popup/components/AddRuleForm.tsx'
import { RuleItem } from '@/popup/components/RuleItem.tsx'
import { SectionCard } from '@/popup/components/SectionCard.tsx'
import { useTabRulesStore } from '@/popup/store/tabRules.ts'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function RulesList() {
  const { t } = useTranslation('tabRules')
  const { rules, toggleRule, deleteRule, reorderRules } = useTabRulesStore((s) => ({
    rules: s.rules,
    toggleRule: s.toggleRule,
    deleteRule: s.deleteRule,
    reorderRules: s.reorderRules,
  }))
  const [formOpen, setFormOpen] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const handleDragStart = (idx: number) => {
    setDragIdx(idx)
  }

  const handleDragOver = (e: DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return

    const newOrder = [...rules.map((r) => r.id)]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(idx, 0, moved)
    reorderRules(newOrder)
    setDragIdx(idx)
  }

  const handleDragEnd = () => {
    setDragIdx(null)
  }

  return (
    <SectionCard title={t('rules.title')}>
      {rules.length === 0 && !formOpen && (
        <p className="text-center text-xs text-muted-foreground opacity-60">{t('rules.empty')}</p>
      )}

      <div className="space-y-1.5">
        {rules.map((rule, idx) => (
          <div
            key={rule.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
          >
            <RuleItem
              rule={rule}
              onToggle={() => toggleRule(rule.id)}
              onDelete={() => deleteRule(rule.id)}
            />
          </div>
        ))}
      </div>

      {formOpen ? (
        <AddRuleForm onClose={() => setFormOpen(false)} />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground"
          onClick={() => setFormOpen(true)}
        >
          <Plus size={14} className="mr-1" />
          {t('rules.addRule')}
        </Button>
      )}

      {rules.length > 0 && (
        <p className="text-center text-[10px] text-muted-foreground opacity-60">
          {t('rules.hint')}
        </p>
      )}
    </SectionCard>
  )
}
