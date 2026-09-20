import { Button } from '@/components/ui/button.tsx'
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import type {
  IntegrationErrorKey,
  RemoteScopeOption,
  TodoIntegration,
} from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  adapter: TodoIntegration
  onBack: () => void
}

/**
 * Picks the remote scope (a Trello board, a Vikunja project+view, ...). The
 * scope itself is opaque here — only its label is shown — so the `Select`,
 * which needs a string value, keys options by their position in the list.
 */
export function TodoSettingsScopePicker({ adapter, onBack }: Props) {
  const { t } = useTranslation('todoWidget')
  const pickScope = useTodoStore((state) => state.pickScope)
  const [options, setOptions] = useState<RemoteScopeOption[] | null>(null)
  const [errorKey, setErrorKey] = useState<IntegrationErrorKey | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void adapter.listScopes().then((out) => {
      if (cancelled) return
      if (out.ok) {
        setOptions(out.value)
      } else {
        setErrorKey(out.errorKey)
      }
    })
    return () => {
      cancelled = true
    }
  }, [adapter])

  const handleContinue = async () => {
    const option = selectedIndex === undefined ? undefined : options?.[Number(selectedIndex)]
    if (!option) return

    setBusy(true)
    setErrorKey(null)
    const [containersOut, projectsOut] = await Promise.all([
      adapter.listContainers(option.scope),
      adapter.listProjects(option.scope),
    ])
    if (!containersOut.ok) {
      setErrorKey(containersOut.errorKey)
      setBusy(false)
      return
    }
    if (!projectsOut.ok) {
      setErrorKey(projectsOut.errorKey)
      setBusy(false)
      return
    }
    pickScope(option.scope, option.name, containersOut.value, projectsOut.value)
    setBusy(false)
  }

  return (
    <div className="grid gap-4">
      {options === null && !errorKey && (
        <div className="grid gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      )}

      {options !== null && options.length === 0 && !errorKey && (
        <p className="text-sm text-muted-foreground">{t('integrations.trello.board.empty')}</p>
      )}

      {options !== null && options.length > 0 && (
        <Field>
          <FieldLabel htmlFor="trello-board">{t('integrations.trello.board.pickLabel')}</FieldLabel>
          <Select value={selectedIndex} onValueChange={setSelectedIndex}>
            <SelectTrigger id="trello-board" className="w-full">
              <SelectValue placeholder={t('integrations.trello.board.pickLabel')} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option, index) => (
                <SelectItem key={String(index)} value={String(index)}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {errorKey && (
        <p className="text-sm text-destructive">{t(`integrations.trello.errors.${errorKey}`)}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          {t('integrations.trello.board.back')}
        </Button>
        <Button
          type="button"
          onClick={handleContinue}
          disabled={selectedIndex === undefined || busy}
        >
          {t('integrations.trello.board.continue')}
        </Button>
      </div>
    </div>
  )
}
