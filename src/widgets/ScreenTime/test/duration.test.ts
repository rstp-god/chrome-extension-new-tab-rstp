import { describe, expect, it } from 'vitest'

import { toHoursMinutes } from '@/widgets/ScreenTime/utils/duration.ts'

describe('toHoursMinutes', () => {
  it('returns zeros for non-positive inputs', () => {
    expect(toHoursMinutes(0)).toEqual({ hours: 0, minutes: 0, subMinute: false })
    expect(toHoursMinutes(-10)).toEqual({ hours: 0, minutes: 0, subMinute: false })
    expect(toHoursMinutes(NaN)).toEqual({ hours: 0, minutes: 0, subMinute: false })
    expect(toHoursMinutes(Infinity)).toEqual({ hours: 0, minutes: 0, subMinute: false })
  })

  it('flags sub-minute durations', () => {
    expect(toHoursMinutes(5)).toEqual({ hours: 0, minutes: 0, subMinute: true })
    expect(toHoursMinutes(29)).toEqual({ hours: 0, minutes: 0, subMinute: true })
  })

  it('rounds to the nearest minute', () => {
    expect(toHoursMinutes(30)).toEqual({ hours: 0, minutes: 1, subMinute: false })
    expect(toHoursMinutes(60)).toEqual({ hours: 0, minutes: 1, subMinute: false })
    expect(toHoursMinutes(89)).toEqual({ hours: 0, minutes: 1, subMinute: false })
    expect(toHoursMinutes(90)).toEqual({ hours: 0, minutes: 2, subMinute: false })
  })

  it('splits hours + minutes', () => {
    // 5h 43m = 5 * 60 * 60 + 43 * 60 = 20_580
    expect(toHoursMinutes(20_580)).toEqual({ hours: 5, minutes: 43, subMinute: false })
    // Exactly 1 hour
    expect(toHoursMinutes(3600)).toEqual({ hours: 1, minutes: 0, subMinute: false })
  })
})
