import { describe, expect, it } from 'vitest'
import {
  daysBetween,
  matchesSearch,
  suggestLinks,
  unlinkedTransactions,
  MAX_LINK_DAYS,
} from './linking'
import type { ImportedTransaction, Transaction } from './types'

function imported(
  id: string,
  date: string,
  amountCents: number,
  transactionId: string | null = null,
): ImportedTransaction {
  return {
    id,
    bankAccountId: 'account',
    date,
    merchant: `merchant ${id}`,
    amountCents,
    transactionId,
  }
}

function tracked(id: string, date: string, amountCents: number): Transaction {
  return { id, date, merchant: `entered ${id}`, amountCents, splits: [] }
}

describe('daysBetween', () => {
  it('counts whole days, either direction', () => {
    expect(daysBetween('2024-03-05', '2024-03-05')).toBe(0)
    expect(daysBetween('2024-03-05', '2024-03-08')).toBe(3)
    expect(daysBetween('2024-03-08', '2024-03-05')).toBe(3)
  })

  it('crosses a month boundary', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
  })
})

describe('suggestLinks', () => {
  it('pairs an exact amount within the date window', () => {
    const suggestions = suggestLinks(
      [imported('i1', '2024-03-07', -450)],
      [tracked('t1', '2024-03-05', -450)],
    )

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({ daysApart: 2 })
  })

  it('ignores a different amount', () => {
    expect(
      suggestLinks(
        [imported('i1', '2024-03-05', -450)],
        [tracked('t1', '2024-03-05', -451)],
      ),
    ).toEqual([])
  })

  it('ignores a date further apart than the window', () => {
    expect(
      suggestLinks(
        [imported('i1', '2024-03-05', -450)],
        [tracked('t1', `2024-03-${11 + MAX_LINK_DAYS - 5}`, -450)],
      ),
    ).toEqual([])
  })

  it('skips rows that are already linked', () => {
    expect(
      suggestLinks(
        [imported('i1', '2024-03-05', -450, 't1')],
        [tracked('t1', '2024-03-05', -450)],
      ),
    ).toEqual([])
  })

  it('uses each row and each transaction at most once', () => {
    const suggestions = suggestLinks(
      [imported('i1', '2024-03-05', -450), imported('i2', '2024-03-06', -450)],
      [tracked('t1', '2024-03-05', -450)],
    )

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].imported.id).toBe('i1')
  })

  it('gives each transaction its closest row', () => {
    const suggestions = suggestLinks(
      [imported('i1', '2024-03-05', -450), imported('i2', '2024-03-09', -450)],
      [tracked('t1', '2024-03-09', -450), tracked('t2', '2024-03-05', -450)],
    )

    expect(
      suggestions.map(({ imported: row, transaction }) => [
        row.id,
        transaction.id,
      ]),
    ).toEqual([
      ['i1', 't2'],
      ['i2', 't1'],
    ])
  })
})

describe('unlinkedTransactions', () => {
  it('drops transactions an imported row points at', () => {
    const result = unlinkedTransactions(
      [tracked('t1', '2024-03-05', -450), tracked('t2', '2024-03-06', -900)],
      [imported('i1', '2024-03-05', -450, 't1')],
    )

    expect(result.map((transaction) => transaction.id)).toEqual(['t2'])
  })
})

describe('matchesSearch', () => {
  const row = { merchant: 'SHELL OIL 4471', amountCents: -4512 }

  it('matches everything on an empty query', () => {
    expect(matchesSearch(row, '   ')).toBe(true)
  })

  it('matches part of the merchant, ignoring case', () => {
    expect(matchesSearch(row, 'shell')).toBe(true)
    expect(matchesSearch(row, 'oil 44')).toBe(true)
    expect(matchesSearch(row, 'supermarket')).toBe(false)
  })

  it('matches an amount from its start, whatever the sign', () => {
    expect(matchesSearch(row, '45')).toBe(true)
    expect(matchesSearch(row, '45.12')).toBe(true)
    expect(matchesSearch(row, '$45.12')).toBe(true)
    expect(matchesSearch(row, '-45.12')).toBe(true)
    // The cents are not the start of the figure, and 4 is not 45.
    expect(matchesSearch(row, '12')).toBe(false)
    expect(matchesSearch(row, '46')).toBe(false)
  })

  it('does not offer a debit to a query that asked for a credit', () => {
    expect(matchesSearch({ merchant: 'PAY', amountCents: -4512 }, '-45')).toBe(
      true,
    )
    expect(matchesSearch({ merchant: 'PAY', amountCents: 4512 }, '-45')).toBe(
      false,
    )
  })

  it('reads a thousands comma, and refuses text that is not a figure', () => {
    const big = { merchant: 'RENT', amountCents: -123456 }
    expect(matchesSearch(big, '1,234.56')).toBe(true)
    expect(matchesSearch(big, '12..3')).toBe(false)
  })
})
