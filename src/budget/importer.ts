/**
 * Deciding what in a bank file is new.
 *
 * Bank exports overlap: the easiest way to get this month's transactions is to
 * download the last ninety days again, so most of what arrives has been seen
 * before. There is no stable identifier to match on — the same statement
 * re-exported can come back with a differently-spelled merchant — so rows are
 * matched on the pair that a bank does keep stable, the date and the amount.
 *
 * That pair is not unique: two $4.50 coffees on the same Tuesday are two real
 * transactions. So matching is done per group rather than per row: for each
 * (date, amount), the file says how many happened and the database says how
 * many are already recorded, and the difference is what gets inserted. A file
 * with three and a database with two means one new coffee, not three
 * duplicates — and not, as the previous implementation had it, three rows
 * rejected as unresolvable.
 *
 * The opposite imbalance is the one worth a human's attention: more recorded
 * than the file reports means an earlier import put in something this file
 * does not have, which no automatic rule can safely undo. Those come back as
 * `conflicts` and nothing is inserted for them.
 */
import { formatAmount } from './money'
import type { CsvRow } from './csv'
import type { IsoDate } from './types'

/** The fields of an already-imported row that matching looks at. */
export interface ExistingRow {
  date: IsoDate
  amountCents: number
}

export interface ImportConflict {
  date: IsoDate
  amountCents: number
  /** How many rows the file has for this date and amount. */
  inFile: number
  /** How many are already recorded against the account. */
  recorded: number
  message: string
}

export interface ImportPlan {
  /** The rows to insert, in the order they appeared in the file. */
  toInsert: CsvRow[]
  /** How many rows were already recorded and so are being skipped. */
  duplicateCount: number
  conflicts: ImportConflict[]
}

function groupKey(row: ExistingRow): string {
  return `${row.date}|${row.amountCents}`
}

/**
 * Works out which of `rows` are new against `existing`, which is every row
 * already imported for the same bank account.
 */
export function planImport(
  rows: readonly CsvRow[],
  existing: readonly ExistingRow[],
): ImportPlan {
  const recordedByKey = new Map<string, number>()
  for (const row of existing) {
    const key = groupKey(row)
    recordedByKey.set(key, (recordedByKey.get(key) ?? 0) + 1)
  }

  const fileByKey = new Map<string, CsvRow[]>()
  for (const row of rows) {
    const key = groupKey(row)
    const group = fileByKey.get(key)
    if (group) group.push(row)
    else fileByKey.set(key, [row])
  }

  const toInsert: CsvRow[] = []
  const conflicts: ImportConflict[] = []
  let duplicateCount = 0

  for (const group of fileByKey.values()) {
    const [first] = group
    const recorded = recordedByKey.get(groupKey(first)) ?? 0

    if (group.length > recorded) {
      // Skip as many as are already recorded and keep the rest. Which of an
      // interchangeable group is kept is arbitrary but deterministic — they
      // differ only in merchant spelling — so re-running an import is stable.
      toInsert.push(...group.slice(recorded))
      duplicateCount += recorded
      continue
    }

    duplicateCount += group.length

    if (recorded > group.length) {
      conflicts.push({
        date: first.date,
        amountCents: first.amountCents,
        inFile: group.length,
        recorded,
        message:
          `${recorded} transactions of ${formatAmount(first.amountCents)} are ` +
          `already recorded on ${first.date}, but this file has ` +
          `${group.length}. Nothing was imported for them — check for an ` +
          `earlier double import.`,
      })
    }
  }

  // Restore the file's own order, which the grouping above scrambled.
  const insertSet = new Set(toInsert)
  return {
    toInsert: rows.filter((row) => insertSet.has(row)),
    duplicateCount,
    conflicts,
  }
}
