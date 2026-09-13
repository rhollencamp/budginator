/**
 * Reading a SimpleFIN account set.
 *
 * SimpleFIN is a bank aggregator's read-only feed: one `GET /accounts` returns
 * every connected account with a window of its transactions. It is the same
 * job `csv.ts` does for a downloaded statement — turn what a bank says into a
 * date, a merchant and signed integer cents — with the same rule about
 * failure: a transaction that cannot be read comes back as an error rather
 * than being guessed at or skipped, because a silently dropped row is one
 * nobody goes looking for. The difference is that nobody is watching a
 * scheduled sync, so the errors are for a log rather than a screen.
 *
 * Two things this deliberately does not do:
 *
 *  - **No multiplier.** SimpleFIN signs amounts the way this app does, money
 *    out of the account negative, so the per-account `multiplier` that a CSV
 *    needs would flip every charge into income if it were applied again.
 *  - **No deletion or correction.** The feed can report an incomplete listing
 *    (`act.missingdata`), and a pending charge that later posts arrives under a
 *    different id. Rows only ever get inserted, so a partial answer costs the
 *    next sync's work and never unsays something already recorded.
 */
import { toIsoDate } from './dates'
import { parseAmount } from './money'
import type { IsoDate } from './types'

/** A transaction as SimpleFIN reports it. */
export interface SimpleFinTransaction {
  id: string
  /** Seconds since the epoch, and `0` while a transaction is pending. */
  posted: number
  /** A decimal string, positive for money arriving. */
  amount: string
  description?: string
  pending?: boolean
}

export interface SimpleFinAccount {
  id: string
  name: string
  currency?: string
  transactions?: SimpleFinTransaction[]
}

/** The body of a `GET /accounts` response. */
export interface SimpleFinAccountSet {
  accounts?: SimpleFinAccount[]
  /** Protocol v2: an object per error. */
  errlist?: { code?: string; msg?: string }[]
  /** Protocol v1: a plain string per error. Still sent by some servers. */
  errors?: string[]
}

/** A transaction ready to be inserted into the import queue. */
export interface SyncedRow {
  /** `<account id>:<transaction id>`, the sync's de-duplication key. */
  externalId: string
  date: IsoDate
  merchant: string
  /** Signed cents, negative for money leaving the account. */
  amountCents: number
}

export interface SyncedRowError {
  /** Empty when the transaction had no id to build one from. */
  externalId: string
  message: string
  /** The transaction as received, for the log line that reports this. */
  transaction: SimpleFinTransaction
}

export interface SyncedAccount {
  rows: SyncedRow[]
  errors: SyncedRowError[]
  /** Pending transactions, which are counted rather than read. See below. */
  pendingCount: number
}

/**
 * The key a synced row is de-duplicated on. SimpleFIN promises a transaction
 * id is unique within its account and explicitly allows two accounts at one
 * institution to reuse one, so the account's id has to be part of it.
 */
export function buildExternalId(
  accountId: string,
  transactionId: string,
): string {
  return `${accountId}:${transactionId}`
}

/**
 * The calendar day an epoch timestamp falls on in `timeZone`, as an IsoDate.
 *
 * The timezone is a parameter for the same reason `today()` takes the date
 * it is asked about: the sync runs on a server whose own clock is UTC, so
 * "local" there is not the household's local. A Tuesday-evening charge in
 * Chicago posts at 01:30 UTC on Wednesday, and reading it as Wednesday moves
 * it into the wrong month's budget on the last day of every month.
 *
 * `Intl` is what knows the offset on a given day, daylight saving included.
 * It is asked for the parts rather than a formatted string so the shape of
 * the result is this module's own and not a locale's.
 */
export function epochToIsoDate(seconds: number, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(seconds * 1000))

  const field = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((part) => part.type === type)?.value)

  return toIsoDate(field('year'), field('month'), field('day'))
}

/**
 * Reads one account's transactions.
 *
 * Pending transactions are counted and dropped. They are not requested in the
 * first place — `pending=1` is opt-in and the sync does not send it — but a
 * pending row carries a `posted` of `0` and an amount the bank may still
 * revise, and it reappears under a fresh id once it settles. Recording one
 * would put a transaction dated 1970 in the queue and a duplicate behind it.
 */
export function readSimpleFinAccount(
  account: SimpleFinAccount,
  timeZone: string,
): SyncedAccount {
  const rows: SyncedRow[] = []
  const errors: SyncedRowError[] = []
  let pendingCount = 0

  for (const transaction of account.transactions ?? []) {
    const externalId = transaction.id
      ? buildExternalId(account.id, transaction.id)
      : ''

    const fail = (message: string) =>
      errors.push({ externalId, message, transaction })

    if (transaction.pending) {
      pendingCount += 1
      continue
    }

    if (!externalId) {
      fail('The transaction has no id, so it cannot be de-duplicated.')
      continue
    }

    // A settled transaction always has a posted time; `0` means the server
    // sent a pending one without saying so, and its date would be 1970.
    if (!Number.isFinite(transaction.posted) || transaction.posted <= 0) {
      fail(`Unreadable posted time: ${JSON.stringify(transaction.posted)}`)
      continue
    }

    // Rejects a third decimal place rather than rounding it, exactly as a CSV
    // column is treated: sub-cent precision here means the amount is not in
    // the currency this app assumes and the ledger should not absorb it.
    const amountCents = parseAmount(transaction.amount ?? '')
    if (amountCents === null) {
      fail(`Unreadable amount: ${JSON.stringify(transaction.amount)}`)
      continue
    }

    rows.push({
      externalId,
      date: epochToIsoDate(transaction.posted, timeZone),
      merchant: (transaction.description ?? '').trim(),
      amountCents,
    })
  }

  return { rows, errors, pendingCount }
}

/**
 * The account set's own errors, as lines for a log.
 *
 * These are about a connection rather than a transaction — a bank that needs
 * signing into again, an account the bridge could not reach this time. They
 * never mean the accounts that did come back are wrong, so the sync reports
 * them and gets on with what it has.
 */
export function readAccountSetErrors(set: SimpleFinAccountSet): string[] {
  const fromErrlist = (set.errlist ?? []).map((error) =>
    [error.code, error.msg].filter(Boolean).join(': '),
  )

  return [...fromErrlist, ...(set.errors ?? [])].filter(
    (message) => message !== '',
  )
}
