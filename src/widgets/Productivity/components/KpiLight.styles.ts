import type { KpiStatus } from '@/widgets/Productivity/lib/kpi.ts'

/** Цвет и halo точки светофора по статусу. */
export const KPI_DOT_CLASS: Record<KpiStatus, string> = {
  green: 'bg-emerald-500 shadow-[0_0_6px_2px_rgb(16_185_129_/_0.4)]',
  yellow: 'bg-amber-500 shadow-[0_0_6px_2px_rgb(245_158_11_/_0.4)]',
  red: 'bg-rose-500 shadow-[0_0_6px_2px_rgb(244_63_94_/_0.4)]',
  cold: 'bg-zinc-400',
}
