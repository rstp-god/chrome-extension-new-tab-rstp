// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createI18nModuleMock } from '@tests/mocks/i18n.ts'

vi.mock('react-i18next', () => createI18nModuleMock())

import { ProductivityNumber } from '@/widgets/Productivity/components/ProductivityNumber.tsx'
import { TestId } from '@tests/constants/testIds.ts'

afterEach(cleanup)

const DEFAULT_PROPS = {
  label: 'CLOSED',
  value: 5,
  baseline: null,
  coldStart: false,
  comparisonLabel: 'to weekday avg',
}

describe('ProductivityNumber', () => {
  it('renders the label and value', () => {
    render(<ProductivityNumber {...DEFAULT_PROPS} />)
    expect(screen.getByText('CLOSED')).toBeDefined()
    expect(screen.getByText('5')).toBeDefined()
  })

  it('baseline=null, coldStart=false → no delta number or comparison text shown', () => {
    render(<ProductivityNumber {...DEFAULT_PROPS} baseline={null} coldStart={false} />)
    expect(screen.queryByTestId(TestId.ProductivityDeltaPositive)).toBeNull()
    expect(screen.queryByTestId(TestId.ProductivityDeltaNegative)).toBeNull()
    expect(screen.queryByTestId(TestId.ProductivityDeltaAsUsual)).toBeNull()
    expect(screen.queryByTestId(TestId.ProductivityDeltaColdStart)).toBeNull()
    // comparisonLabel text should not be visible
    expect(screen.queryByText('to weekday avg')).toBeNull()
  })

  it('coldStart=true → cold-start element is shown; no delta number', () => {
    render(<ProductivityNumber {...DEFAULT_PROPS} coldStart={true} baseline={3} />)
    const coldStartEl = screen.getByTestId(TestId.ProductivityDeltaColdStart)
    expect(coldStartEl).toBeDefined()
    // Key is returned as-is by the mock t()
    expect(coldStartEl.textContent).toBe('coldStart')
    // No delta-numeric elements
    expect(screen.queryByTestId(TestId.ProductivityDeltaPositive)).toBeNull()
    expect(screen.queryByTestId(TestId.ProductivityDeltaNegative)).toBeNull()
    expect(screen.queryByText('to weekday avg')).toBeNull()
  })

  it('value > baseline → +N delta with comparison label and positive color class', () => {
    render(<ProductivityNumber {...DEFAULT_PROPS} value={8} baseline={5} />)
    const el = screen.getByTestId(TestId.ProductivityDeltaPositive)
    expect(el).toBeDefined()
    expect(el.textContent).toContain('+3')
    expect(el.textContent).toContain('to weekday avg')
    expect(el.className).toContain('text-emerald-500')
  })

  it('value < baseline → −N delta with Unicode minus and negative color class', () => {
    render(<ProductivityNumber {...DEFAULT_PROPS} value={2} baseline={5} />)
    const el = screen.getByTestId(TestId.ProductivityDeltaNegative)
    expect(el).toBeDefined()
    // U+2212 minus sign
    expect(el.textContent).toContain('−3')
    expect(el.textContent).toContain('to weekday avg')
    expect(el.className).toContain('text-rose-500')
  })

  it('value === baseline → "as usual" text is shown', () => {
    render(<ProductivityNumber {...DEFAULT_PROPS} value={5} baseline={5} />)
    const el = screen.getByTestId(TestId.ProductivityDeltaAsUsual)
    expect(el).toBeDefined()
    // Mock t() returns the key
    expect(el.textContent).toBe('delta.asUsual')
    expect(el.className).toContain('opacity-40')
  })

  it('fractional baseline producing a .5 magnitude renders without trailing .0', () => {
    // value=5, baseline=4.5 → delta=0.5 → magnitude "0.5"
    render(<ProductivityNumber {...DEFAULT_PROPS} value={5} baseline={4.5} />)
    const el = screen.getByTestId(TestId.ProductivityDeltaPositive)
    expect(el.textContent).toContain('+0.5')
  })

  it('integer delta does not include decimal point', () => {
    // value=8, baseline=5 → delta=3 → magnitude "3" not "3.0"
    render(<ProductivityNumber {...DEFAULT_PROPS} value={8} baseline={5} />)
    const el = screen.getByTestId(TestId.ProductivityDeltaPositive)
    expect(el.textContent).not.toContain('3.0')
    expect(el.textContent).toContain('+3')
  })

  it('merges extra className onto root element', () => {
    const { container } = render(
      <ProductivityNumber {...DEFAULT_PROPS} className="my-custom-class" />,
    )
    expect(container.firstChild).toBeDefined()
    expect((container.firstChild as HTMLElement).className).toContain('my-custom-class')
  })
})
