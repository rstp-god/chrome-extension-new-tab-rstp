import { CARD_BASE, FONT_CSS, resolveColors } from '@/newtab/components/Settings/presets.ts'
import { useAppearanceStore } from '@/store/appearance.ts'
import { useHeaderStore } from '@/store/header.ts'
import { computeForeground, withAlpha } from '@/utils/color.ts'
import { useEffect } from 'react'

/**
 * Reads the appearance store + active theme and writes the resulting
 * CSS custom properties onto <html>. Re-runs whenever any dependency changes.
 *
 * Grid settings are intentionally NOT applied here — WidgetsGrid reads grid
 * config from the appearance store directly.
 */
export function useApplyAppearance() {
  const theme = useHeaderStore((s) => s.theme)
  const colorScheme = useAppearanceStore((s) => s.colorScheme)
  const customColors = useAppearanceStore((s) => s.customColors)
  const radius = useAppearanceStore((s) => s.radius)
  const cardOpacity = useAppearanceStore((s) => s.cardOpacity)
  const font = useAppearanceStore((s) => s.font)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement.style
    const colors = resolveColors(colorScheme, customColors, theme)
    const fontCss = FONT_CSS[font]

    const vars: Record<string, string> = {
      '--primary': colors.primary,
      '--primary-foreground': computeForeground(colors.primary),
      '--accent': colors.accent,
      '--accent-foreground': computeForeground(colors.accent),
      '--muted': colors.muted,
      '--muted-foreground': computeForeground(colors.muted),
      '--radius': `${radius}rem`,
      '--card': withAlpha(CARD_BASE[theme], cardOpacity),
      '--font-sans': fontCss,
      '--font-mono': fontCss,
    }

    for (const [key, value] of Object.entries(vars)) {
      root.setProperty(key, value)
    }
  }, [theme, colorScheme, customColors, radius, cardOpacity, font])
}
