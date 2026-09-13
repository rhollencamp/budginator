import { describe, expect, it } from 'vitest'
import { planImport, type ExistingRow } from './importer'
import type { CsvRow } from './csv'

function row(date: string, amountCents: number, merchant = 'SHOP'): CsvRow {
  return { date, amountCents, merchant }
}

const existing = (rows: readonly CsvRow[]): ExistingRow[] =>
  rows.map(({ date, amountCents }) => ({ date, amountCents }))

describe('planImport', () => {
  it('imports everything into an empty account', () => {
    const rows = [row('2024-03-05', -450), row('2024-03-06', -900)]

    expect(planImport(rows, [])).toMatchObject({
      toInsert: rows,
      duplicateCount: 0,
      conflicts: [],
    })
  })

  it('skips rows already recorded', () => {
    const rows = [row('2024-03-05', -450), row('2024-03-06', -900)]

    expect(planImport(rows, existing(rows))).toMatchObject({
      toInsert: [],
      duplicateCount: 2,
      conflicts: [],
    })
  })

  it('matches on date and amount, not on merchant text', () => {
    const before = [row('2024-03-05', -450, 'SQ *COFFEE 1234')]
    const again = [row('2024-03-05', -450, 'COFFEE SHOP')]

    expect(planImport(again, existing(before)).toInsert).toEqual([])
  })

  it('imports only the surplus of a repeated date and amount', () => {
    const rows = [
      row('2024-03-05', -450, 'first'),
      row('2024-03-05', -450, 'second'),
      row('2024-03-05', -450, 'third'),
    ]

    const plan = planImport(rows, existing(rows.slice(0, 2)))

    expect(plan.toInsert).toHaveLength(1)
    expect(plan.duplicateCount).toBe(2)
    expect(plan.conflicts).toEqual([])
  })

  it('treats a same-day, same-amount pair as two transactions', () => {
    const rows = [
      row('2024-03-05', -450, 'morning'),
      row('2024-03-05', -450, 'afternoon'),
    ]

    expect(planImport(rows, []).toInsert).toHaveLength(2)
  })

  it('flags a group the database has more of than the file', () => {
    const rows = [row('2024-03-05', -450)]
    const recorded = [...existing(rows), ...existing(rows)]

    const plan = planImport(rows, recorded)

    expect(plan.toInsert).toEqual([])
    expect(plan.duplicateCount).toBe(1)
    expect(plan.conflicts).toEqual([
      expect.objectContaining({
        date: '2024-03-05',
        amountCents: -450,
        inFile: 1,
        recorded: 2,
      }),
    ])
  })

  it('keeps the file order in the rows it inserts', () => {
    const rows = [
      row('2024-03-07', -100, 'c'),
      row('2024-03-05', -450, 'a'),
      row('2024-03-06', -900, 'b'),
    ]

    expect(
      planImport(rows, []).toInsert.map((entry) => entry.merchant),
    ).toEqual(['c', 'a', 'b'])
  })

  it('is idempotent: importing the plan then re-running imports nothing', () => {
    const rows = [
      row('2024-03-05', -450),
      row('2024-03-05', -450),
      row('2024-03-06', -900),
    ]

    const first = planImport(rows, [])
    const second = planImport(rows, existing(first.toInsert))

    expect(second.toInsert).toEqual([])
    expect(second.conflicts).toEqual([])
  })
})
