/**
 * Turning an opaque `RemoteScope` back into the pair Vikunja addresses a task
 * list by.
 *
 * Its own module rather than a private helper in `index.ts` because two
 * independent things need it — the adapter and the broadcast subscriber — and
 * the subscriber is reached *from* the descriptor in `index.ts`, so importing
 * it back from there would close an import cycle.
 */

import type { RemoteScope } from '@/widgets/Todo/integrations/types.ts'

export interface VikunjaScopePair {
  projectId: number
  viewId: number
}

/**
 * `RemoteScope` is an open record, so a Vikunja scope may arrive with a
 * missing, string or unparseable id. Total by construction: anything that is
 * not a finite number yields `null` rather than `NaN` travelling into a
 * persisted config.
 */
export function scopeNumber(raw: unknown): number | null {
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN
  // Vikunja ids start at 1, so a zero, a negative or a fractional value is a
  // corrupt scope rather than an unusual one — and `Number('')` is 0, which
  // would otherwise sail through as a valid id.
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

/** Both halves of a Vikunja scope, or `null` if either is unusable. */
export function scopePair(scope: RemoteScope): VikunjaScopePair | null {
  const projectId = scopeNumber(scope.projectId)
  const viewId = scopeNumber(scope.viewId)
  if (projectId === null || viewId === null) return null
  return { projectId, viewId }
}
