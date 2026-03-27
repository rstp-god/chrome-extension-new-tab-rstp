import { useBackgroundImageLoader } from '@/newtab/components/Background/hooks/useBackgroundImageLoader.ts'
import { loadBackground, saveBackground } from '@/services/chrome/background.ts'
import { BackgroundStateV1, DEFAULT_BG } from '@/types/background.ts'
import { useCallback, useEffect, useState } from 'react'

export function useBackgroundState() {
  const [bg, setBg] = useState<BackgroundStateV1>(DEFAULT_BG)
  const { dataUrl, load } = useBackgroundImageLoader()

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const loaded = await loadBackground()
      if (cancelled) return

      setBg(loaded)
      if (loaded.mode === 'local') {
        await load(loaded.imageId)
      } else {
        await load(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [load])

  const persist = useCallback(
    async (next: BackgroundStateV1) => {
      await saveBackground(next)
      setBg(next)
      if (next.mode === 'local') await load(next.imageId)
      else await load(null)
    },
    [load],
  )

  return { bg, bgDataUrl: dataUrl, persist }
}
