// @vitest-environment jsdom
import { ColorInput } from '@/newtab/components/Settings/ColorInput.tsx'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

describe('ColorInput', () => {
  it('renders label and shows current value as hex', () => {
    render(<ColorInput label="Primary" value="oklch(1 0 0)" onChange={() => {}} />)
    expect(screen.getByText('Primary')).toBeDefined()

    const textInput = screen.getByRole('textbox') as HTMLInputElement
    expect(textInput.value.toLowerCase()).toBe('#ffffff')
  })

  it('emits oklch onChange when a valid hex is typed', async () => {
    const onChange = vi.fn()
    render(<ColorInput label="Primary" value="oklch(0 0 0)" onChange={onChange} />)

    const textInput = screen.getByRole('textbox') as HTMLInputElement
    const user = userEvent.setup()
    await user.clear(textInput)
    await user.type(textInput, '#3366cc')

    const last = onChange.mock.calls.at(-1)?.[0] as string | undefined
    expect(last).toBeDefined()
    expect(last).toMatch(/^oklch\(/)
  })

  it('ignores invalid hex strings (does not call onChange)', async () => {
    const onChange = vi.fn()
    render(<ColorInput label="Primary" value="oklch(0 0 0)" onChange={onChange} />)

    const textInput = screen.getByRole('textbox') as HTMLInputElement
    const user = userEvent.setup()
    await user.clear(textInput)
    await user.type(textInput, '#zzzz')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not overwrite just-committed user hex on self-triggered re-render', async () => {
    // Simulates the parent pattern: onChange → parent setState → re-render with
    // new value prop. The ref guard inside ColorInput must prevent the effect
    // from rewriting `hex` back to oklchToHex(value) when value came from our
    // own onChange call (round-trip would otherwise drift by 1 RGB step on
    // certain colours).
    function Parent() {
      const [value, setValue] = useState('oklch(0 0 0)')
      return <ColorInput label="Primary" value={value} onChange={setValue} />
    }

    render(<Parent />)
    const textInput = screen.getByRole('textbox') as HTMLInputElement

    const user = userEvent.setup()
    await user.clear(textInput)
    await user.type(textInput, '#3366cc')

    expect(textInput.value.toLowerCase()).toBe('#3366cc')
  })

  it('syncs to new external value when scheme is switched from outside', () => {
    const { rerender } = render(
      <ColorInput label="Primary" value="oklch(0 0 0)" onChange={() => {}} />,
    )
    const textInput = screen.getByRole('textbox') as HTMLInputElement
    expect(textInput.value.toLowerCase()).toBe('#000000')

    rerender(<ColorInput label="Primary" value="oklch(1 0 0)" onChange={() => {}} />)
    expect(textInput.value.toLowerCase()).toBe('#ffffff')
  })
})
