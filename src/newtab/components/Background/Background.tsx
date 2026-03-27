import { BackgroundStateV1 } from '@/types/background.ts'

interface Props {
  state: BackgroundStateV1
  dataUrl: string | null
}

export function Background({ state, dataUrl }: Props) {
  const bg = dataUrl ? `url("${dataUrl}")` : 'none'

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        backgroundImage: `linear-gradient(to bottom, oklch(0 0 0 / ${state.dim}), oklch(0 0 0 / ${state.dim})), ${bg}`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: `blur(${state.blur}px) saturate(${state.saturate})`,
        transform: 'scale(1.08)',
      }}
    />
  )
}
