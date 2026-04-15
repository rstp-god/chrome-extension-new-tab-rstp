import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
}

/** A labelled vertical stack — title on top, content below. Used to compose
 * dumb section layouts across Settings and other panels. */
export function Block({ title, children }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </div>
  )
}
