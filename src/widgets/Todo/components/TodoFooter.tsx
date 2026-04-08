import { Button } from '@/components/ui/button.tsx'
import { TestId } from '@tests/constants/testIds.ts'
import { CheckIcon, PlusIcon, Settings2Icon, Trash2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  showCompleted: boolean
  showDeleted: boolean
  onToggleCompleted: () => void
  onToggleDeleted: () => void
  onOpenAdd: () => void
  onOpenSettings: () => void
}

export function TodoFooter({
  showCompleted,
  showDeleted,
  onToggleCompleted,
  onToggleDeleted,
  onOpenAdd,
  onOpenSettings,
}: Props) {
  const { t } = useTranslation('todoWidget')

  return (
    <div className="mt-auto flex items-center gap-2">
      <Button
        data-testid={TestId.TodoToggleCompleted}
        type="button"
        variant={showCompleted ? 'default' : 'outline'}
        size="icon"
        className={showCompleted ? 'bg-emerald-600 text-white hover:bg-emerald-500' : ''}
        onClick={onToggleCompleted}
        aria-label={t('actions.toggleCompleted')}
      >
        <CheckIcon />
      </Button>
      <Button
        data-testid={TestId.TodoToggleDeleted}
        type="button"
        variant={showDeleted ? 'destructive' : 'outline'}
        size="icon"
        onClick={onToggleDeleted}
        aria-label={t('actions.toggleDeleted')}
      >
        <Trash2Icon />
      </Button>
      <Button data-testid={TestId.TodoOpenAdd} size="lg" className="flex-1" onClick={onOpenAdd}>
        <PlusIcon />
        {t('actions.addTodo')}
      </Button>
      <Button
        data-testid={TestId.TodoOpenSettings}
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onOpenSettings}
        aria-label={t('actions.openSettings')}
      >
        <Settings2Icon />
      </Button>
    </div>
  )
}
