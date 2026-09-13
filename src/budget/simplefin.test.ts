import { describe, expect, it } from 'vitest'
import {
  buildExternalId,
  epochToIsoDate,
  readAccountSetErrors,
  readSimpleFinAccount,
} from './simplefin'
import type { SimpleFinAccount, SimpleFinTransaction } from './simplefin'

const CHICAGO = 'America/Chicago'

function transaction(
  fields: Partial<SimpleFinTransaction> = {},
): SimpleFinTransaction {
  return {
    id: 'tx-1',
    posted: 1465286400,
    amount: '-8.88',
    description: 'Grocery Store',
    ...fields,
  }
}

function account(
  transactions: SimpleFinTransaction[],
  fields: Partial<SimpleFinAccount> = {},
): SimpleFinAccount {
  return { id: 'acct-1', name: 'Checking', transactions, ...fields }
}

describe('epochToIsoDate', () => {
  it('reads the day in the given zone, not UTC', () => {
    // 2024-03-05 20:30 in Chicago, which is already the 6th in UTC. Reading
    // this as UTC is what moves a transaction into the next month.
    const evening = 1709692200

    expect(epochToIsoDate(evening, CHICAGO)).toBe('2024-03-05')
    expect(epochToIsoDate(evening, 'UTC')).toBe('2024-03-06')
  })

  it('keeps a month-end charge in its own month', () => {
    // 2024-01-31 21:00 in Chicago is 2024-02-01 03:00 UTC.
    expect(epochToIsoDate(1706756400, CHICAGO)).toBe('2024-01-31')
  })

  it('uses the offset in force on the day, not today’s', () => {
    // 2024-07-04 19:00 Chicago is CDT (-5); the same wall time in January is
    // CST (-6). Both are late enough in the day to be tomorrow in UTC.
    expect(epochToIsoDate(1720137600, CHICAGO)).toBe('2024-07-04')
    expect(epochToIsoDate(1704416400, CHICAGO)).toBe('2024-01-04')
  })

  it('zero-pads a single-digit month and day', () => {
    expect(epochToIsoDate(1704412800, 'UTC')).toBe('2024-01-05')
  })
})

describe('buildExternalId', () => {
  it('qualifies the transaction id with its account', () => {
    expect(buildExternalId('acct-1', 'tx-1')).toBe('acct-1:tx-1')
  })

  it('keeps the same transaction id in two accounts apart', () => {
    // SimpleFIN only promises an id is unique within its own account.
    expect(buildExternalId('acct-1', '7')).not.toBe(
      buildExternalId('acct-2', '7'),
    )
  })
})

describe('readSimpleFinAccount', () => {
  it('reads a transaction into cents, a date and a merchant', () => {
    const { rows, errors } = readSimpleFinAccount(
      account([transaction({ amount: '-33293.43', posted: 1709692200 })]),
      CHICAGO,
    )

    expect(errors).toEqual([])
    expect(rows).toEqual([
      {
        externalId: 'acct-1:tx-1',
        date: '2024-03-05',
        merchant: 'Grocery Store',
        amountCents: -3329343,
      },
    ])
  })

  it('leaves the sign alone, so a deposit stays positive', () => {
    const { rows } = readSimpleFinAccount(
      account([transaction({ amount: '1200.00' })]),
      CHICAGO,
    )

    expect(rows[0].amountCents).toBe(120000)
  })

  it('counts pending transactions instead of recording them', () => {
    const { rows, pendingCount } = readSimpleFinAccount(
      account([
        transaction({ id: 'settled' }),
        transaction({ id: 'held', posted: 0, pending: true }),
      ]),
      CHICAGO,
    )

    expect(rows.map((row) => row.externalId)).toEqual(['acct-1:settled'])
    expect(pendingCount).toBe(1)
  })

  it('reports an unreadable amount rather than dropping the row', () => {
    const { rows, errors } = readSimpleFinAccount(
      account([transaction({ amount: 'not money' })]),
      CHICAGO,
    )

    expect(rows).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0].externalId).toBe('acct-1:tx-1')
    expect(errors[0].message).toContain('Unreadable amount')
  })

  it('rejects a sub-cent amount instead of rounding it', () => {
    const { rows, errors } = readSimpleFinAccount(
      account([transaction({ amount: '-8.885' })]),
      CHICAGO,
    )

    expect(rows).toEqual([])
    expect(errors).toHaveLength(1)
  })

  it('reports a settled transaction with no posted time', () => {
    const { rows, errors } = readSimpleFinAccount(
      account([transaction({ posted: 0 })]),
      CHICAGO,
    )

    expect(rows).toEqual([])
    expect(errors[0].message).toContain('Unreadable posted time')
  })

  it('reports a transaction with no id, which could not be de-duplicated', () => {
    const { rows, errors } = readSimpleFinAccount(
      account([transaction({ id: '' })]),
      CHICAGO,
    )

    expect(rows).toEqual([])
    expect(errors[0].externalId).toBe('')
    expect(errors[0].message).toContain('no id')
  })

  it('keeps reading after a bad row', () => {
    const { rows, errors } = readSimpleFinAccount(
      account([
        transaction({ id: 'bad', amount: '' }),
        transaction({ id: 'good' }),
      ]),
      CHICAGO,
    )

    expect(rows.map((row) => row.externalId)).toEqual(['acct-1:good'])
    expect(errors).toHaveLength(1)
  })

  it('trims a padded description and accepts a missing one', () => {
    const { rows } = readSimpleFinAccount(
      account([
        transaction({ id: 'a', description: '  Uncle Frank’s  ' }),
        transaction({ id: 'b', description: undefined }),
      ]),
      CHICAGO,
    )

    expect(rows.map((row) => row.merchant)).toEqual(['Uncle Frank’s', ''])
  })

  it('reads an account with no transactions at all', () => {
    expect(
      readSimpleFinAccount({ id: 'acct-1', name: 'Savings' }, CHICAGO),
    ).toEqual({ rows: [], errors: [], pendingCount: 0 })
  })
})

describe('readAccountSetErrors', () => {
  it('reads the v2 error objects', () => {
    expect(
      readAccountSetErrors({
        errlist: [{ code: 'con.auth', msg: 'Sign in to Alliant again' }],
      }),
    ).toEqual(['con.auth: Sign in to Alliant again'])
  })

  it('reads the v1 error strings too', () => {
    expect(
      readAccountSetErrors({ errors: ['Connection to PNC failed'] }),
    ).toEqual(['Connection to PNC failed'])
  })

  it('is empty for a clean response', () => {
    expect(readAccountSetErrors({ errlist: [], accounts: [] })).toEqual([])
  })
})
