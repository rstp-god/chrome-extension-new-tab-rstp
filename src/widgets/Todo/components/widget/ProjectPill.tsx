import type { Project } from '@/widgets/Todo/integrations/index.ts'
import { DEFAULT_PROJECT_PILL_CLASS } from '@/widgets/Todo/integrations/trello/projectStyles.ts'
import clsx from 'clsx'

interface Props {
  project: Project
  className?: string
}

/**
 * Project label rendered as a small pill. The color comes from
 * `project.pillClassName` which is computed by the integration adapter
 * (e.g. Trello label color → tailwind class), so this component stays
 * provider-agnostic.
 *
 * `DEFAULT_PROJECT_PILL_CLASS` is re-exported from the Trello adapter
 * because it currently happens to be the only project source we ship —
 * once a second integration shows up, this default can move to a shared
 * location.
 */
export function ProjectPill({ project, className }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider',
        project.pillClassName ?? DEFAULT_PROJECT_PILL_CLASS,
        className,
      )}
    >
      {project.name}
    </span>
  )
}
