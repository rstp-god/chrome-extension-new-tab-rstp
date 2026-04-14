import { beforeEach, describe, expect, it, vi } from 'vitest'

const setWidgetsMock = vi.hoisted(() => vi.fn())
const commitMock = vi.hoisted(() => vi.fn(async () => {}))
const widgetStateRef = vi.hoisted(() => ({
  layout: [
    { i: 'a', x: 0, y: 0, w: 6, h: 2 },
    { i: 'b', x: 6, y: 0, w: 6, h: 2 },
  ],
  widgets: [
    {
      id: 'a',
      title: 't1',
      widgetType: 'Search',
      layout: { i: 'a', x: 0, y: 0, w: 6, h: 2 },
    },
    {
      id: 'b',
      title: 't2',
      widgetType: 'Todo',
      layout: { i: 'b', x: 6, y: 0, w: 6, h: 2 },
    },
  ],
}))

vi.mock('@/store/widget.ts', () => ({
  useWidgetStore: {
    getState: () => ({
      widgets: widgetStateRef.widgets,
      layout: widgetStateRef.layout,
      setWidgets: setWidgetsMock,
      commit: commitMock,
    }),
  },
}))

import { useAppearanceStore } from '@/store/appearance.ts'
import { DEFAULT_APPEARANCE } from '@/types/appearance.ts'

describe('useAppearanceStore', () => {
  beforeEach(() => {
    useAppearanceStore.setState({ ...DEFAULT_APPEARANCE })
    setWidgetsMock.mockClear()
    commitMock.mockClear()
  })

  it('setColorScheme updates the scheme', () => {
    useAppearanceStore.getState().setColorScheme('ocean')
    expect(useAppearanceStore.getState().colorScheme).toBe('ocean')
  })

  it('setCustomColor switches scheme to custom and updates a single key', () => {
    useAppearanceStore.getState().setCustomColor('dark', 'primary', 'oklch(0.7 0.15 30)')
    const state = useAppearanceStore.getState()
    expect(state.colorScheme).toBe('custom')
    expect(state.customColors.dark.primary).toBe('oklch(0.7 0.15 30)')
    expect(state.customColors.dark.accent).toBe(DEFAULT_APPEARANCE.customColors.dark.accent)
  })

  it('setRadius clamps-free update', () => {
    useAppearanceStore.getState().setRadius(1.25)
    expect(useAppearanceStore.getState().radius).toBe(1.25)
  })

  it('setCardOpacity updates value', () => {
    useAppearanceStore.getState().setCardOpacity(0.5)
    expect(useAppearanceStore.getState().cardOpacity).toBe(0.5)
  })

  it('setFont updates font', () => {
    useAppearanceStore.getState().setFont('inter')
    expect(useAppearanceStore.getState().font).toBe('inter')
  })

  it('setGridPreset switches preset values and rescales widgets when columns change', () => {
    useAppearanceStore.getState().setGridPreset('spacious')
    const grid = useAppearanceStore.getState().grid
    expect(grid.preset).toBe('spacious')
    expect(grid.columns).toBe(8)
    expect(setWidgetsMock).toHaveBeenCalledTimes(1)
    expect(commitMock).toHaveBeenCalledTimes(1)
  })

  it('setGridCustom with columns triggers rescale', () => {
    useAppearanceStore.getState().setGridCustom({ columns: 24 })
    expect(setWidgetsMock).toHaveBeenCalledTimes(1)
    expect(useAppearanceStore.getState().grid.preset).toBe('custom')
    expect(useAppearanceStore.getState().grid.columns).toBe(24)
  })

  it('setGridCustom without columns does not rescale', () => {
    useAppearanceStore.getState().setGridCustom({ gap: 20 })
    expect(setWidgetsMock).not.toHaveBeenCalled()
    expect(useAppearanceStore.getState().grid.gap).toBe(20)
  })

  it('resetToDefaults restores defaults', () => {
    useAppearanceStore.getState().setColorScheme('ocean')
    useAppearanceStore.getState().setRadius(1.5)
    useAppearanceStore.getState().setFont('plex')
    useAppearanceStore.getState().resetToDefaults()
    const state = useAppearanceStore.getState()
    expect(state.colorScheme).toBe(DEFAULT_APPEARANCE.colorScheme)
    expect(state.radius).toBe(DEFAULT_APPEARANCE.radius)
    expect(state.font).toBe(DEFAULT_APPEARANCE.font)
  })
})
