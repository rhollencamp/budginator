import { describe, expect, it } from 'vitest'
import {
  amountForBudget,
  budgetIdsOf,
  datedSplits,
  splitRemainder,
  splitsBalance,
  touchesBudget,
} from './transactions'
import type { Transaction } from './types'

function transaction(
  overrides: Partial<Transaction> & Pick<Transaction, 'splits'>,
): Transaction {
  return {
    id: 't1',
    date: '2024-03-05',
    merchant: 'SUPERMARKET',
    amountCents: -10000,
    ...overrides,
  }
}

const split = (budgetId: string, amountCents: number) => ({
  id: `${budgetId}-split`,
  budgetId,
  amountCents,
  note: '',
})

describe('splitRemainder', () => {
  it('is zero when the splits account for the whole amount', () => {
    expect(splitRemainder(-10000, [split('a', -7000), split('b', -3000)])).toBe(
      0,
    )
  })

  it('reports what is still unaccounted for', () => {
    expect(splitRemainder(-10000, [split('a', -7000)])).toBe(-3000)
  })

  it('goes the other way when the splits overshoot', () => {
    expect(splitRemainder(-10000, [split('a', -12000)])).toBe(2000)
  })

  it('is the whole amount with no splits', () => {
    expect(splitRemainder(-10000, [])).toBe(-10000)
  })
})

describe('splitsBalance', () => {
  it('is exact to the cent', () => {
    expect(splitsBalance(-10000, [split('a', -9999)])).toBe(false)
    expect(splitsBalance(-10000, [split('a', -10000)])).toBe(true)
  })
})

describe('datedSplits', () => {
  it('carries the transaction date onto each split', () => {
    const result = datedSplits([
      transaction({ splits: [split('a', -7000), split('b', -3000)] }),
    ])

    expect(result).toEqual([
      { budgetId: 'a', amountCents: -7000, date: '2024-03-05' },
      { budgetId: 'b', amountCents: -3000, date: '2024-03-05' },
    ])
  })

  it('is empty for a transaction with no splits', () => {
    expect(datedSplits([transaction({ splits: [] })])).toEqual([])
  })
})

describe('budgetIdsOf', () => {
  it('lists each budget once, in split order', () => {
    expect(
      budgetIdsOf(
        transaction({
          splits: [split('b', -1000), split('a', -2000), split('b', -3000)],
        }),
      ),
    ).toEqual(['b', 'a'])
  })
})

describe('touchesBudget', () => {
  it('finds a budget among the splits', () => {
    const entry = transaction({ splits: [split('a', -10000)] })

    expect(touchesBudget(entry, 'a')).toBe(true)
    expect(touchesBudget(entry, 'b')).toBe(false)
  })
})

describe('amountForBudget', () => {
  it('sums every split charged to the budget', () => {
    const entry = transaction({
      splits: [split('a', -7000), split('b', -1000), split('a', -2000)],
    })

    expect(amountForBudget(entry, 'a')).toBe(-9000)
    expect(amountForBudget(entry, 'c')).toBe(0)
  })
})
