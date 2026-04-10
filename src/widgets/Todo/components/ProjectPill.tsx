import type { Project } from '@/widgets/Todo/integrations/index.ts'
import { getProjectPillClass } from '@/widgets/Todo/statusStyles.ts'
import clsx from 'clsx'

interface Props {
  project: Project
  className?: string
}

export function ProjectPill({ project, className }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider',
        getProjectPillClass(project.colorToken),
        className,
      )}
    >
      {project.name}
    </span>
  )
}
