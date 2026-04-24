import { HexColorPicker } from 'react-colorful'
import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
import { CHART_PALETTE_PRESETS, CHART_SHADE_LIGHTNESSES } from '@/data/chartPalette.ts'
import type { ChartPalette } from '@/background/activity/types.ts'
import { generateChartPalette } from '@/utils/color.ts'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

interface Labels {
  description?: string
  preview?: string
  hex?: string
  pickColor?: string
  /** Preset key → localized display name. Missing keys fall back to the raw key. */
  presets?: Partial<Record<string, string>>
}

interface Props {
  value: ChartPalette
  onChange: (next: ChartPalette) => void
  labels?: Labels
  testIdPrefix?: string
}

export function ChartPalettePicker({ value, onChange, labels, testIdPrefix }: Props) {
  const { baseHex } = value

  // Local hex holds partial typing ("#3" → "#33") so the Input doesn't snap
  // back before the user finishes. Synced from parent on every real change.
  const [hex, setHex] = useState(baseHex)
  useEffect(() => {
    setHex(baseHex)
  }, [baseHex])

  const commit = (nextHex: string) => {
    setHex(nextHex)
    if (!HEX_RE.test(nextHex)) return
    onChange({
      baseHex: nextHex,
      shades: generateChartPalette(nextHex, CHART_SHADE_LIGHTNESSES),
    })
  }

  const handlePreset = (next: string) => {
    if (!next) return
    commit(next)
  }

  const normalizedBase = baseHex.toLowerCase()
  const selectedPresetValue =
    [...CHART_PALETTE_PRESETS.values()].find((preset) => preset.toLowerCase() === normalizedBase) ??
    ''

  const swatchColor = HEX_RE.test(hex) ? hex : baseHex

  return (
    <div className="flex flex-col gap-3" data-testid={testIdPrefix}>
      {labels?.description && <p className="text-xs text-muted-foreground">{labels.description}</p>}

      <ToggleGroup
        type="single"
        value={selectedPresetValue}
        onValueChange={handlePreset}
        variant="outline"
        size="sm"
        spacing={1}
        className="flex-wrap"
      >
        {[...CHART_PALETTE_PRESETS.entries()].map(([key, hexValue]) => {
          const label = labels?.presets?.[key] ?? key
          return (
            <ToggleGroupItem key={key} value={hexValue} aria-label={label} className="gap-2">
              <span
                className="inline-block size-3 rounded-full border border-border"
                style={{ backgroundColor: hexValue }}
              />
              {label}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>

      <div className="flex items-center gap-3">
        {labels?.hex && (
          <span className="w-20 shrink-0 text-xs text-muted-foreground">{labels.hex}</span>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={labels?.pickColor}
              className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-border ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              style={{ backgroundColor: swatchColor }}
            />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <HexColorPicker color={swatchColor} onChange={commit} />
          </PopoverContent>
        </Popover>

        <Input
          value={hex}
          onChange={(e) => commit(e.target.value)}
          className="h-8 flex-1 font-mono text-xs"
          spellCheck={false}
          data-testid={testIdPrefix ? `${testIdPrefix}-hex` : undefined}
        />
      </div>

      <div
        className="flex items-center gap-1"
        data-testid={testIdPrefix ? `${testIdPrefix}-preview` : undefined}
        aria-label={labels?.preview}
      >
        {value.shades.map((shade, i) => (
          <span
            key={`${i}-${shade}`}
            className="h-6 flex-1 rounded-md border border-border"
            style={{ backgroundColor: shade }}
          />
        ))}
      </div>
    </div>
  )
}
