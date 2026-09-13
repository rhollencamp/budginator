/**
 * Calendar dates as `YYYY-MM-DD` strings.
 *
 * A transaction happens on a day, not at an instant, so nothing in the domain
 * holds a `Date`: parsing `'2024-03-01'` into one gives midnight UTC, which is
 * the last day of February for anybody west of Greenwich, and that shifts a
 * transaction into the wrong month's budget. The helpers here read and build
 * the string's own fields instead, and the only `Date` in the module is in
 * `today()`, where the local calendar day is exactly what is wanted.
 */
import type { IsoDate } from './types'

export interface YearMonth {
  year: number
  /** 1-12, as written, not a `Date`'s zero-based month. */
  month: number
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Whether a string is a well-formed `YYYY-MM-DD` calendar date. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false

  const [, year, month, day] = match
  const date = new Date(`${value}T00:00:00Z`)

  // Round-trip through UTC to reject the likes of `2023-02-31`, which the
  // Date constructor would otherwise roll forward into March.
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
  )
}

/** Today in the device's own timezone. */
export function today(): IsoDate {
  const now = new Date()
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** Builds a date string from its fields, zero-padding month and day. */
export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
    day,
  ).padStart(2, '0')}`
}

/** The year and month a date falls in. */
export function yearMonthOf(date: IsoDate): YearMonth {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) }
}

/** A sortable `YYYY-MM` key for a year/month pair. */
export function monthKey({ year, month }: YearMonth): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/** Compares two year/month pairs the way a sort comparator wants. */
export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a.year === b.year ? a.month - b.month : a.year - b.year
}

/**
 * How many monthly top-ups a budget starting in `start` has had by `end`,
 * counting both ends: a budget that started this month has had one.
 * Zero if `end` falls before `start`.
 */
export function monthsElapsed(start: YearMonth, end: YearMonth): number {
  const months = (end.year - start.year) * 12 + (end.month - start.month) + 1
  return Math.max(0, months)
}

/**
 * The months from `start` through `end` inclusive, oldest first. Empty when
 * `end` precedes `start`.
 */
export function monthsBetween(start: YearMonth, end: YearMonth): YearMonth[] {
  const result: YearMonth[] = []
  let { year, month } = start

  while (compareYearMonth({ year, month }, end) <= 0) {
    result.push({ year, month })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  return result
}

/** The name of a month, for a heading: `monthName(3)` is `'March'`. */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month)
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
