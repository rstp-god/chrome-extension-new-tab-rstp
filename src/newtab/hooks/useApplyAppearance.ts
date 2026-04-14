import { CARD_BASE, FONT_CSS, resolveColors } from '@/newtab/components/Settings/presets.ts'
import { useAppearanceStore } from '@/store/appearance.ts'
import { useHeaderStore } from '@/store/header.ts'
import { computeForeground, withAlpha } from '@/utils/color.ts'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 * Reads the appearance store + active theme and writes the resulting
 * CSS custom properties onto <html>. Re-runs whenever any dependency changes.
 *
 * Grid settings are intentionally NOT applied here — WidgetsGrid reads grid
 * config from the appearance store directly.
 */
export function useApplyAppearance() {
  const theme = useHeaderStore((s) => s.theme)
  const { colorScheme, customColors, radius, cardOpacity, font } = useAppearanceStore(
    useShallow((s) => ({
      colorScheme: s.colorScheme,
      customColors: s.customColors,
      radius: s.radius,
      cardOpacity: s.cardOpacity,
      font: s.font,
    })),
  )

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
