import { CARD_BASE, FONT_CSS, resolveColors } from '@/data/appearance.ts'
import { useAppearanceStore } from '@/store/appearance.ts'
import { useHeaderStore } from '@/store/header.ts'
import { withAlpha } from '@/utils/color.ts'
import { applyTheme } from '@/utils/theme.ts'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 * Reads the appearance store + active theme and writes the resulting
 * CSS custom properties onto <html>. Re-runs whenever any dependency changes.
 *
 * Foregrounds come from the resolved Palette (explicit values for presets,
 * auto-computed for custom) — NOT recomputed on the fly here. That's what
 * keeps the "default" preset visually identical to the tokens in styles.css.
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
    // Keep the legacy `.dark` class in sync with the store. Tokens declared
    // inside `.dark {}` in styles.css (e.g. --border, --input) are still
    // scoped to the class, so without this call a fresh-boot session with
    // no stored state would render dark card colours but light borders.
    applyTheme(theme)

    const root = document.documentElement.style
    const palette = resolveColors(colorScheme, customColors, theme)
    const fontCss = FONT_CSS[font]

    const vars: Record<string, string> = {
      '--primary': palette.primary,
      '--primary-foreground': palette.primaryForeground,
      '--accent': palette.accent,
      '--accent-foreground': palette.accentForeground,
      '--muted': palette.muted,
      '--muted-foreground': palette.mutedForeground,
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
