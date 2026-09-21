import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { MappingStatusRow } from '@/widgets/Todo/components/settings/MappingStatusRow.tsx'
import { TODO_STATUSES } from '@/widgets/Todo/integrations/types.ts'

import type {
  RemoteContainer,
  StatusListMapping,
  TodoStatus,
} from '@/widgets/Todo/integrations/types.ts'

interface Props {
  buckets: RemoteContainer[]
  draft: StatusListMapping
  onAdd: (status: TodoStatus, bucketId: string) => void
  onRemove: (status: TodoStatus, bucketId: string) => void
}

/**
 * The five status rows of the Vikunja wizard.
 *
 * The same `MappingStatusRow` the generic table uses — only the wording is
 * Vikunja's ("bucket", not "list"), and the ownership index that hides a
 * bucket already spoken for lives here rather than in the step.
 */
export function VikunjaMappingRows({ buckets, draft, onAdd, onRemove }: Props) {
  const { t } = useTranslation('todoWidget')

  const bucketNameById = useMemo(
    () => new Map(buckets.map((bucket) => [bucket.id, bucket.name])),
    [buckets],
  )

  /** Inverse of the draft, so each row's "is this bucket taken?" check is O(1). */
  const ownerByBucketId = useMemo(
    () =>
      new Map<string, TodoStatus>(
        TODO_STATUSES.flatMap((status) => draft[status].map((id) => [id, status] as const)),
      ),
    [draft],
  )

  return (
    <div className="grid gap-2">
      {TODO_STATUSES.map((status) => (
        <MappingStatusRow
          key={status}
          status={status}
          statusLabel={t(`integrations.mapping.row.${status}`)}
          selectedListIds={draft[status]}
          listNameById={bucketNameById}
          availableLists={buckets}
          isSelectedInOther={(bucketId) => {
            const owner = ownerByBucketId.get(bucketId)
            return owner !== undefined && owner !== status
          }}
          onAdd={(bucketId) => onAdd(status, bucketId)}
          onRemove={(bucketId) => onRemove(status, bucketId)}
          primaryHint={t('integrations.mapping.primaryHint')}
          emptyHint={t('integrations.vikunja.mapping.emptyHint')}
          addLabel={t('integrations.vikunja.mapping.addBucket')}
        />
      ))}
    </div>
  )
}
