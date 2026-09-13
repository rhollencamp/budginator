import { describe, expect, it } from 'vitest'
import { summarizeBudgets, type DatedSplit } from './budgets'
import { sumCents } from './money'
import type { Budget } from './types'

const groceries: Budget = {
  id: 'groceries',
  name: 'Groceries',
  icon: '🛒',
  amountCents: 50000,
  startDate: '2024-01-01',
}

/** A label with no allowance, only used to group transactions. */
const uncategorised: Budget = {
  id: 'misc',
  name: 'Misc',
  icon: '❓',
  amountCents: 0,
  startDate: '2024-01-01',
}

function split(
  budgetId: string,
  date: string,
  amountCents: number,
): DatedSplit {
  return { budgetId, date, amountCents }
}

describe('summarizeBudgets', () => {
  it('accrues the allowance once per month, counting the starting month', () => {
    const [summary] = summarizeBudgets([groceries], [], '2024-03-15')

    expect(summary.allowanceCents).toBe(150000)
    expect(summary.spentCents).toBe(0)
    expect(summary.availableCents).toBe(150000)
  })

  it('carries an under-spent month forward', () => {
    const [summary] = summarizeBudgets(
      [groceries],
      [
        split('groceries', '2024-01-10', -20000),
        split('groceries', '2024-02-10', -60000),
      ],
      '2024-02-29',
    )

    // Two months of allowance, 80000 spent: the January surplus funds February.
    expect(summary.availableCents).toBe(100000 - 80000)
  })

  it('goes negative when the envelope is overdrawn', () => {
    const [summary] = summarizeBudgets(
      [groceries],
      [split('groceries', '2024-01-10', -70000)],
      '2024-01-31',
    )

    expect(summary.availableCents).toBe(-20000)
  })

  it('adds income back to the envelope', () => {
    const [summary] = summarizeBudgets(
      [groceries],
      [
        split('groceries', '2024-01-10', -20000),
        split('groceries', '2024-01-20', 5000),
      ],
      '2024-01-31',
    )

    expect(summary.availableCents).toBe(50000 - 15000)
  })

  it('reports months newest first, from the start through asOf', () => {
    const [summary] = summarizeBudgets([groceries], [], '2024-03-15')

    expect(summary.months.map((month) => [month.year, month.month])).toEqual([
      [2024, 3],
      [2024, 2],
      [2024, 1],
    ])
  })

  it('keeps a back-dated split, in a month with no allowance', () => {
    const [summary] = summarizeBudgets(
      [groceries],
      [split('groceries', '2023-12-20', -1000)],
      '2024-01-31',
    )

    const december = summary.months.at(-1)
    expect(december).toMatchObject({
      year: 2023,
      month: 12,
      allowanceCents: 0,
      spentCents: -1000,
      netCents: -1000,
    })
    // The allowance is unaffected; the split still counts against the total.
    expect(summary.allowanceCents).toBe(50000)
    expect(summary.availableCents).toBe(49000)
  })

  it('keeps the month rows summing to the available balance', () => {
    const [summary] = summarizeBudgets(
      [groceries],
      [
        split('groceries', '2023-12-20', -1000),
        split('groceries', '2024-01-10', -20000),
        split('groceries', '2024-03-01', -90000),
      ],
      '2024-03-15',
    )

    expect(sumCents(summary.months.map((month) => month.netCents))).toBe(
      summary.availableCents,
    )
  })

  it('ignores splits belonging to another budget', () => {
    const [summary] = summarizeBudgets(
      [groceries],
      [split('rent', '2024-01-10', -100000)],
      '2024-01-31',
    )

    expect(summary.spentCents).toBe(0)
  })

  it('tracks a zero-allowance budget as pure spend', () => {
    const [summary] = summarizeBudgets(
      [uncategorised],
      [split('misc', '2024-01-10', -1234)],
      '2024-02-15',
    )

    expect(summary.allowanceCents).toBe(0)
    expect(summary.availableCents).toBe(-1234)
  })

  it('gives a budget that has not started yet no allowance', () => {
    const future: Budget = { ...groceries, startDate: '2025-01-01' }

    expect(summarizeBudgets([future], [], '2024-06-01')[0]).toMatchObject({
      allowanceCents: 0,
      availableCents: 0,
    })
  })

  it('returns one summary per budget, in the order given', () => {
    const summaries = summarizeBudgets(
      [groceries, uncategorised],
      [],
      '2024-01-31',
    )

    expect(summaries.map((summary) => summary.budget.id)).toEqual([
      'groceries',
      'misc',
    ])
  })
})
