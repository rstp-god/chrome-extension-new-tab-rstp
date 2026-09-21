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
  ScopeStepProps,
} from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** A `Select` needs a string value, and a scope is an opaque record. */
function scopeKey(scope: RemoteScope): string {
  return JSON.stringify(scope)
}

/**
 * Picks the remote scope (a Trello board, a Vikunja project+view, ...). The
 * scope itself is opaque here — only its label is shown — so options are
 * keyed by their serialized scope, which survives a reordered list.
 *
 * The default `descriptor.ScopeStep`, so it takes `ScopeStepProps` like a
 * backend's own step would. Living in the settings layer rather than being
 * reached through a descriptor, it may read the store directly and ignores
 * most of them — it keeps its own error state, because the failure it has to
 * show (`listScopes` refused) never reaches the store.
 *
 * The integration's *name* is all it takes from the slice, and only for the
 * wording: Trello picks a *board*, Vikunja a *project*. The step itself stays
 * backend-agnostic — only the i18n namespace it reads changes.
 */
export function TodoSettingsScopePicker({ adapter, integration, onBack, onDone }: ScopeStepProps) {
  const { t } = useTranslation('todoWidget')
  const pickScope = useTodoStore((state) => state.pickScope)
  const boardKey = (leaf: string) => `integrations.${integration.name}.board.${leaf}`
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
    // Awaited: for a backend whose projects are its scopes the store asks
    // again once the pick has landed, and the button stays busy until it has.
    await pickScope(option.scope, option.name, containersOut.value, projectsOut.value)
    setBusy(false)
    // The scope is persisted, so whatever the dialog shows next follows from
    // the state rather than from the intent that opened this step.
    onDone()
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
        <p className="text-sm text-muted-foreground">{t(boardKey('empty'))}</p>
      )}

      {options !== null && options.length > 0 && (
        <Field>
          <FieldLabel htmlFor="todo-scope">{t(boardKey('pickLabel'))}</FieldLabel>
          <Select value={selectedKey} onValueChange={setSelectedKey}>
            <SelectTrigger id="todo-scope" className="w-full">
              <SelectValue placeholder={t(boardKey('pickLabel'))} />
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
          {t('integrations.actions.back')}
        </Button>
        <Button type="button" onClick={handleContinue} disabled={selectedKey === undefined || busy}>
          {t('integrations.actions.continue')}
        </Button>
      </div>
    </div>
  )
}
