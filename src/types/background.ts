export type BackgroundStateV1 = {
  version: 1
  mode: 'none' | 'local'
  imageId: string | null
  dim: number
  blur: number
  saturate: number
}

export const DEFAULT_BG: BackgroundStateV1 = {
  version: 1,
  mode: 'none',
  imageId: null,
  dim: 0.55,
  blur: 22,
  saturate: 1.1,
}
