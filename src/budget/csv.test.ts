import { describe, expect, it } from 'vitest'
import { parseBankCsv, parseCsv, parseCsvDate } from './csv'

describe('parseCsv', () => {
  it('splits plain rows', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('keeps commas and newlines inside quoted fields', () => {
    expect(parseCsv('a,b\n"x, y","line\nbreak"')).toEqual([
      ['a', 'b'],
      ['x, y', 'line\nbreak'],
    ])
  })

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']])
  })

  it('accepts CRLF and a byte order mark', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('drops blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('reads a final row with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('preserves empty fields', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ])
  })
})

describe('parseCsvDate', () => {
  it('reads ISO dates', () => {
    expect(parseCsvDate('2024-03-05')).toBe('2024-03-05')
  })

  it('reads US dates, padding single digits', () => {
    expect(parseCsvDate('3/5/2024')).toBe('2024-03-05')
    expect(parseCsvDate('03/05/2024')).toBe('2024-03-05')
  })

  it('reads a two-digit year as 20xx', () => {
    expect(parseCsvDate('3/5/24')).toBe('2024-03-05')
  })

  it('rejects impossible and unreadable dates', () => {
    expect(parseCsvDate('2/30/2024')).toBeNull()
    expect(parseCsvDate('13/1/2024')).toBeNull()
    expect(parseCsvDate('5 March 2024')).toBeNull()
    expect(parseCsvDate('')).toBeNull()
  })

  it('accepts a leap day only in a leap year', () => {
    expect(parseCsvDate('2024-02-29')).toBe('2024-02-29')
    expect(parseCsvDate('2023-02-29')).toBeNull()
  })
})

describe('parseBankCsv', () => {
  it('reads a signed amount column through the multiplier', () => {
    const { rows, errors } = parseBankCsv(
      'Date,Description,Amount\n03/05/2024,COFFEE,-4.50\n',
      1,
    )

    expect(errors).toEqual([])
    expect(rows).toEqual([
      { date: '2024-03-05', merchant: 'COFFEE', amountCents: -450 },
    ])
  })

  it('flips the sign for an account that reports spending as positive', () => {
    const { rows } = parseBankCsv(
      'Date,Description,Amount\n03/05/2024,COFFEE,4.50\n',
      -1,
    )

    expect(rows[0].amountCents).toBe(-450)
  })

  it('reads a withdrawals/deposits pair', () => {
    const { rows } = parseBankCsv(
      'Date,Description,Withdrawals,Deposits\n' +
        '2024-03-05,COFFEE,4.50,\n' +
        '2024-03-06,PAYCHECK,,1000.00\n',
      1,
    )

    expect(rows.map((row) => row.amountCents)).toEqual([-450, 100000])
  })

  it('matches header spellings case-insensitively, with aliases', () => {
    const { rows } = parseBankCsv(
      'Transaction Date,Payee,Transaction Amount\n2024-03-05,COFFEE,-4.50\n',
      1,
    )

    expect(rows[0]).toEqual({
      date: '2024-03-05',
      merchant: 'COFFEE',
      amountCents: -450,
    })
  })

  it('reports a bad row instead of dropping it', () => {
    const { rows, errors } = parseBankCsv(
      'Date,Description,Amount\n' +
        'not-a-date,COFFEE,-4.50\n' +
        '2024-03-06,TEA,abc\n' +
        '2024-03-07,CAKE,-1.00\n',
      1,
    )

    expect(rows).toHaveLength(1)
    expect(errors.map((error) => error.line)).toEqual([2, 3])
    expect(errors[0].values).toEqual({
      Date: 'not-a-date',
      Description: 'COFFEE',
      Amount: '-4.50',
    })
  })

  it('keeps an explicit zero amount', () => {
    const { rows } = parseBankCsv(
      'Date,Description,Amount,Deposits\n2024-03-05,FEE REVERSAL,0.00,5.00\n',
      1,
    )

    expect(rows[0].amountCents).toBe(0)
  })

  it('rejects a file with no recognisable columns', () => {
    expect(() => parseBankCsv('Foo,Bar\n1,2\n', 1)).toThrow(/date column/i)
    expect(() => parseBankCsv('Date,Description\n2024-03-05,X\n', 1)).toThrow(
      /amount column/i,
    )
    expect(() => parseBankCsv('', 1)).toThrow(/empty/i)
  })
})
