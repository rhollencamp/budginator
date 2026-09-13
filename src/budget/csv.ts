/**
 * Reading a bank's CSV export.
 *
 * Banks agree on very little: the amount may be one signed column or a
 * withdrawals/deposits pair, the date may be ISO or US, and the header row
 * spells everything differently. This module absorbs that, and everything past
 * it sees the one shape — a date, a merchant, and signed integer cents.
 *
 * It is deliberately forgiving about which columns a file has and unforgiving
 * about what is in them: a row whose amount or date cannot be read comes back
 * as a `CsvRowError` rather than being guessed at or skipped, because a
 * silently dropped transaction is one nobody goes looking for.
 */
import { toIsoDate } from './dates'
import { parseAmount } from './money'
import type { AmountMultiplier, IsoDate } from './types'

export interface CsvRow {
  date: IsoDate
  merchant: string
  /** Signed cents, already through the account's multiplier. */
  amountCents: number
}

export interface CsvRowError {
  /** 1-based row number in the file, counting the header. */
  line: number
  message: string
  /** The row as read, for showing the user what was rejected. */
  values: Record<string, string>
}

export interface ParsedCsv {
  rows: CsvRow[]
  errors: CsvRowError[]
}

/**
 * Splits CSV text into fields, handling quoted fields containing commas,
 * newlines and doubled quotes. Accepts LF and CRLF, with or without a BOM, and
 * drops trailing blank lines.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let started = false

  const endField = () => {
    row.push(field)
    field = ''
    started = false
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  const source = text.startsWith('﻿') ? text.slice(1) : text

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && !started) {
      quoted = true
      started = true
    } else if (char === ',') {
      endField()
    } else if (char === '\r') {
      // Swallow the CR of a CRLF; a lone CR ends the row just the same.
      if (source[i + 1] === '\n') i += 1
      endRow()
    } else if (char === '\n') {
      endRow()
    } else {
      field += char
      started = true
    }
  }

  // A file ending in a newline has no final row; one ending mid-row does.
  if (field !== '' || row.length > 0) endRow()

  return rows.filter((entry) => entry.some((value) => value.trim() !== ''))
}

/** Header spellings, lower-cased, that each column is known by. */
const COLUMNS = {
  date: [
    'date',
    'transaction date',
    'posted date',
    'posting date',
    'post date',
  ],
  merchant: [
    'description',
    'merchant',
    'payee',
    'name',
    'memo',
    'transaction description',
  ],
  amount: ['amount', 'transaction amount'],
  withdrawal: ['withdrawals', 'withdrawal', 'debit', 'debits'],
  deposit: ['deposits', 'deposit', 'credit', 'credits'],
} as const

type ColumnName = keyof typeof COLUMNS

/** Maps each recognised column to its index in the header row. */
function mapHeader(
  header: readonly string[],
): Partial<Record<ColumnName, number>> {
  const normalised = header.map((name) => name.trim().toLowerCase())
  const found: Partial<Record<ColumnName, number>> = {}

  for (const [column, spellings] of Object.entries(COLUMNS) as [
    ColumnName,
    readonly string[],
  ][]) {
    const index = normalised.findIndex((name) => spellings.includes(name))
    if (index !== -1) found[column] = index
  }

  return found
}

/**
 * Reads a bank export into rows the importer can work with.
 *
 * `multiplier` comes from the account (see `AmountMultiplier`) and is applied
 * to every amount, so a statement that reports spending as a positive number
 * still yields negative cents here. Throws only when the file has no header
 * the reader recognises at all — a file that is readable but has bad rows
 * reports those in `errors`.
 */
export function parseBankCsv(
  text: string,
  multiplier: AmountMultiplier,
): ParsedCsv {
  const table = parseCsv(text)
  if (table.length === 0) throw new Error('The file is empty.')

  const [header, ...body] = table
  const columns = mapHeader(header)

  if (columns.date === undefined) {
    throw new Error(
      `No date column found. The header row reads: ${header.join(', ')}`,
    )
  }
  if (
    columns.amount === undefined &&
    columns.withdrawal === undefined &&
    columns.deposit === undefined
  ) {
    throw new Error(
      `No amount column found. The header row reads: ${header.join(', ')}`,
    )
  }

  const rows: CsvRow[] = []
  const errors: CsvRowError[] = []

  body.forEach((values, index) => {
    // +2: the header is line 1, and `index` is zero-based.
    const line = index + 2
    const at = (column: ColumnName) => {
      const position = columns[column]
      return position === undefined ? '' : (values[position]?.trim() ?? '')
    }
    const fail = (message: string) => {
      errors.push({
        line,
        message,
        values: Object.fromEntries(
          header.map((name, position) => [name, values[position] ?? '']),
        ),
      })
    }

    const date = parseCsvDate(at('date'))
    if (date === null) {
      fail(`Could not read the date ${JSON.stringify(at('date'))}.`)
      return
    }

    const amountCents = readAmount(
      at('amount'),
      at('withdrawal'),
      at('deposit'),
    )
    if (amountCents === null) {
      fail('Could not read an amount.')
      return
    }

    rows.push({
      date,
      merchant: at('merchant'),
      amountCents: amountCents * multiplier,
    })
  })

  return { rows, errors }
}

/**
 * The amount before the account multiplier. A signed `Amount` column wins; a
 * withdrawals/deposits pair is read as negative and positive respectively,
 * whichever of the two the row filled in. A row with an explicit zero is a
 * real zero — only a blank falls through to the next column.
 */
function readAmount(
  amount: string,
  withdrawal: string,
  deposit: string,
): number | null {
  if (amount !== '') return parseAmount(amount)

  if (withdrawal !== '') {
    const cents = parseAmount(withdrawal)
    // A withdrawals column is usually unsigned; if the bank signed it anyway,
    // honour the sign it gave rather than flipping it into a deposit.
    return cents === null ? null : -Math.abs(cents)
  }

  if (deposit !== '') {
    const cents = parseAmount(deposit)
    return cents === null ? null : Math.abs(cents)
  }

  return null
}

/**
 * Reads the date formats seen in the wild: ISO `YYYY-MM-DD`, US `M/D/YYYY`,
 * and US with a two-digit year, which is read as 20xx — these are bank
 * statements, so a 19xx transaction is not a case worth guessing at.
 */
export function parseCsvDate(value: string): IsoDate | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  if (iso) return validate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(value)
  if (us) {
    const year = Number(us[3])
    return validate(
      year < 100 ? 2000 + year : year,
      Number(us[1]),
      Number(us[2]),
    )
  }

  return null
}

function validate(year: number, month: number, day: number): IsoDate | null {
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return toIsoDate(year, month, day)
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one, in UTC so no local
  // timezone can shift it.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}
