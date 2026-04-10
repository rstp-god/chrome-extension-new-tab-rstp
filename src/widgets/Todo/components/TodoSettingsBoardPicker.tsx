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
  RemoteBoard,
  TodoIntegration,
} from '@/widgets/Todo/integrations/index.ts'
import { useTodoStore } from '@/widgets/Todo/store/store.ts'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  adapter: TodoIntegration
  onBack: () => void
}

export function TodoSettingsBoardPicker({ adapter, onBack }: Props) {
  const { t } = useTranslation('todoWidget')
  const pickBoard = useTodoStore((state) => state.pickBoard)
  const [boards, setBoards] = useState<RemoteBoard[] | null>(null)
  const [errorKey, setErrorKey] = useState<IntegrationErrorKey | null>(null)
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void adapter.listBoards().then((out) => {
      if (cancelled) return
      if (out.ok) {
        setBoards(out.value)
      } else {
        setErrorKey(out.errorKey)
      }
    })
    return () => {
      cancelled = true
    }
  }, [adapter])

  const handleContinue = async () => {
    const board = boards?.find((candidate) => candidate.id === selectedId)
    if (!board) return

    setBusy(true)
    setErrorKey(null)
    const [listsOut, projectsOut] = await Promise.all([
      adapter.listLists(board.id),
      adapter.listProjects(board.id),
    ])
    if (!listsOut.ok) {
      setErrorKey(listsOut.errorKey)
      setBusy(false)
      return
    }
    if (!projectsOut.ok) {
      setErrorKey(projectsOut.errorKey)
      setBusy(false)
      return
    }
    pickBoard(board.id, board.name, listsOut.value, projectsOut.value)
    setBusy(false)
  }

  return (
    <div className="grid gap-4">
      {boards === null && !errorKey && (
        <div className="grid gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      )}

      {boards !== null && boards.length === 0 && !errorKey && (
        <p className="text-sm text-muted-foreground">{t('integrations.trello.board.empty')}</p>
      )}

      {boards !== null && boards.length > 0 && (
        <Field>
          <FieldLabel htmlFor="trello-board">{t('integrations.trello.board.pickLabel')}</FieldLabel>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger id="trello-board" className="w-full">
              <SelectValue placeholder={t('integrations.trello.board.pickLabel')} />
            </SelectTrigger>
            <SelectContent>
              {boards.map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  {board.name}
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
        <Button type="button" onClick={handleContinue} disabled={!selectedId || busy}>
          {t('integrations.trello.board.continue')}
        </Button>
      </div>
    </div>
  )
}
