import { describe, expect, it } from 'vitest'
import {
  compareYearMonth,
  isIsoDate,
  monthKey,
  monthName,
  monthsBetween,
  monthsElapsed,
  toIsoDate,
  yearMonthOf,
} from './dates'

describe('isIsoDate', () => {
  it('accepts a well-formed date', () => {
    expect(isIsoDate('2024-02-29')).toBe(true)
  })

  it('rejects a day the month does not have', () => {
    expect(isIsoDate('2023-02-29')).toBe(false)
    expect(isIsoDate('2023-04-31')).toBe(false)
  })

  it('rejects other shapes', () => {
    expect(isIsoDate('2023-1-1')).toBe(false)
    expect(isIsoDate('01/02/2023')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })
})

describe('yearMonthOf', () => {
  it('reads the fields without going through a Date', () => {
    expect(yearMonthOf('2024-03-01')).toEqual({ year: 2024, month: 3 })
  })
})

describe('toIsoDate', () => {
  it('zero-pads', () => {
    expect(toIsoDate(2024, 3, 1)).toBe('2024-03-01')
  })
})

describe('monthKey', () => {
  it('sorts lexicographically in calendar order', () => {
    const keys = [
      monthKey({ year: 2024, month: 10 }),
      monthKey({ year: 2024, month: 2 }),
      monthKey({ year: 2023, month: 12 }),
    ]

    expect([...keys].sort()).toEqual(['2023-12', '2024-02', '2024-10'])
  })
})

describe('monthsElapsed', () => {
  it('counts the starting month itself', () => {
    expect(
      monthsElapsed({ year: 2024, month: 3 }, { year: 2024, month: 3 }),
    ).toBe(1)
  })

  it('counts across a year boundary', () => {
    expect(
      monthsElapsed({ year: 2023, month: 11 }, { year: 2024, month: 2 }),
    ).toBe(4)
  })

  it('is zero before the start', () => {
    expect(
      monthsElapsed({ year: 2024, month: 3 }, { year: 2024, month: 1 }),
    ).toBe(0)
  })
})

describe('monthsBetween', () => {
  it('runs oldest first, inclusive of both ends', () => {
    expect(
      monthsBetween({ year: 2023, month: 11 }, { year: 2024, month: 1 }),
    ).toEqual([
      { year: 2023, month: 11 },
      { year: 2023, month: 12 },
      { year: 2024, month: 1 },
    ])
  })

  it('is empty when the end precedes the start', () => {
    expect(
      monthsBetween({ year: 2024, month: 3 }, { year: 2024, month: 1 }),
    ).toEqual([])
  })
})

describe('compareYearMonth', () => {
  it('orders by year then month', () => {
    expect(
      compareYearMonth({ year: 2023, month: 12 }, { year: 2024, month: 1 }),
    ).toBeLessThan(0)
    expect(
      compareYearMonth({ year: 2024, month: 3 }, { year: 2024, month: 3 }),
    ).toBe(0)
  })
})

describe('monthName', () => {
  it('names a month', () => {
    expect(monthName(3)).toBe('March')
  })
})
