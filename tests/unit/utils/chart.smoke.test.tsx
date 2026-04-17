/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart.tsx'

/**
 * Smoke test for the shadcn chart wrapper. Ensures recharts + the generated
 * wrapper module import cleanly, the ResponsiveContainer mounts, and the
 * ChartStyle block injects without throwing.
 *
 * Real widget rendering lives in Stage 5–6 scenario tests.
 */

afterEach(() => {
  cleanup()
})

describe('shadcn chart wrapper (smoke)', () => {
  it('mounts ChartContainer with a minimal config', () => {
    const { container } = render(
      <ChartContainer config={{ a: { label: 'A', color: '#38A0D6' } }}>
        <svg width="10" height="10" />
      </ChartContainer>,
    )
    expect(container.querySelector('[data-slot="chart"]')).not.toBeNull()
  })

  it('re-exports ChartTooltip + ChartTooltipContent', () => {
    expect(ChartTooltip).toBeDefined()
    expect(typeof ChartTooltipContent).toBe('function')
  })
})
