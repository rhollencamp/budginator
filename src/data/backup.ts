/**
 * Downloading the whole ledger as JSON.
 *
 * The Django app had a `/db-backup` endpoint for this. It matters more here,
 * not less: the data lives in somebody else's Postgres now, and a file on your
 * own disk is the only copy that survives an account going away. The export is
 * the domain shape rather than the database rows, so it stays readable by a
 * human and by whatever comes after this app.
 */
import { today } from '../budget/dates'
import type { Ledger } from './api'

export function ledgerToJson(ledger: Ledger): string {
  return JSON.stringify(
    {
      exportedOn: today(),
      // Amounts are integer cents, exactly as stored; nothing is converted to
      // dollars on the way out, so re-importing cannot introduce rounding.
      amountsAre: 'integer cents',
      ...ledger,
    },
    null,
    2,
  )
}

/** Hands the JSON to the browser as a file. */
export function downloadLedger(ledger: Ledger): void {
  const blob = new Blob([ledgerToJson(ledger)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `budginator-${today()}.json`
  link.click()

  // The object URL pins the blob in memory until it is revoked, and the click
  // above is synchronous, so it is safe to let go immediately.
  URL.revokeObjectURL(url)
}
