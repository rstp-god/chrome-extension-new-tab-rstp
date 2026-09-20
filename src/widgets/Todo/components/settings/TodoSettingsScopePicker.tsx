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
  RemoteScope,
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

/** A `Select` needs a string value, and a scope is an opaque record. */
function scopeKey(scope: RemoteScope): string {
  return JSON.stringify(scope)
}

/**
 * Picks the remote scope (a Trello board, a Vikunja project+view, ...). The
 * scope itself is opaque here — only its label is shown — so options are
 * keyed by their serialized scope, which survives a reordered list.
 */
export function TodoSettingsScopePicker({ adapter, onBack }: Props) {
  const { t } = useTranslation('todoWidget')
  const pickScope = useTodoStore((state) => state.pickScope)
  const [options, setOptions] = useState<RemoteScopeOption[] | null>(null)
  const [errorKey, setErrorKey] = useState<IntegrationErrorKey | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | undefined>()
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
    const option = options?.find((candidate) => scopeKey(candidate.scope) === selectedKey)
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
          <FieldLabel htmlFor="todo-scope">{t('integrations.trello.board.pickLabel')}</FieldLabel>
          <Select value={selectedKey} onValueChange={setSelectedKey}>
            <SelectTrigger id="todo-scope" className="w-full">
              <SelectValue placeholder={t('integrations.trello.board.pickLabel')} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={scopeKey(option.scope)} value={scopeKey(option.scope)}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {errorKey && (
        <p className="text-sm text-destructive">{t(`integrations.errors.${errorKey}`)}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          {t('integrations.trello.board.back')}
        </Button>
        <Button type="button" onClick={handleContinue} disabled={selectedKey === undefined || busy}>
          {t('integrations.trello.board.continue')}
        </Button>
      </div>
    </div>
  )
}
