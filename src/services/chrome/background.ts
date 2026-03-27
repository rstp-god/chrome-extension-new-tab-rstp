import { BackgroundStateV1, DEFAULT_BG } from '@/types/background.ts'
import { getLocal, setLocal } from './storage'

const KEY_BG = 'background:v1'
const KEY_IMG = (id: string) => `bgimg:${id}`

export async function loadBackground(): Promise<BackgroundStateV1> {
  return (await getLocal<BackgroundStateV1>(KEY_BG)) ?? DEFAULT_BG
}

export async function saveBackground(state: BackgroundStateV1): Promise<void> {
  await setLocal(KEY_BG, state)
}

export async function saveBgImage(id: string, dataUrl: string): Promise<void> {
  await setLocal(KEY_IMG(id), { dataUrl })
}

export async function loadBgImage(id: string): Promise<string | null> {
  const rec = await getLocal<{ dataUrl: string }>(KEY_IMG(id))
  return rec?.dataUrl ?? null
}
