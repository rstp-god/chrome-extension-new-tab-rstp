type Debounced<TArgs extends unknown[]> = ((...args: TArgs) => void) & {
  cancel: () => void
}

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): Debounced<TArgs> {
  let timerId: number | null = null

  const debounced = ((...args: TArgs) => {
    if (timerId != null) window.clearTimeout(timerId)

    timerId = window.setTimeout(() => {
      timerId = null
      fn(...args)
    }, delayMs)
  }) as Debounced<TArgs>

  debounced.cancel = () => {
    if (timerId == null) return

    window.clearTimeout(timerId)
    timerId = null
  }

  return debounced
}
