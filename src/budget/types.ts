/**
 * The shapes the app works in. These are the domain's own types, not the
 * database rows — `src/data/api.ts` is the single place that maps between the
 * two, so a column rename never reaches this directory.
 *
 * Two conventions run through all of them:
 *  - every money field is integer cents (see `money.ts`), named `...Cents`;
 *  - every date is a calendar date as `YYYY-MM-DD` (see `dates.ts`), never a
 *    `Date`, because a transaction happens on a day and not at an instant.
 */

/** A calendar date as `YYYY-MM-DD`. */
export type IsoDate = string

/**
 * Which way a bank writes its numbers. A statement that reports spending as a
 * positive number takes `-1`, so that after multiplying, a debit is negative
 * everywhere in this app; one that already signs debits negative takes `1`.
 */
export type AmountMultiplier = -1 | 1

export interface BankAccount {
  id: string
  name: string
  multiplier: AmountMultiplier
}

/**
 * An envelope. `amountCents` is what it is topped up by each month from
 * `startDate` onwards; zero marks a budget that is only a label for grouping
 * transactions and has no allowance to run down.
 */
export interface Budget {
  id: string
  name: string
  /** A single emoji, shown beside the name. */
  icon: string
  amountCents: number
  startDate: IsoDate
}

/** One line of a transaction, charged against a single budget. */
export interface Split {
  id: string
  budgetId: string
  amountCents: number
  note: string
}

/**
 * A transaction as budgeted. Spending is negative and income positive, and the
 * splits are expected to sum to `amountCents` — `splitRemainder` measures how
 * far off a set of splits is, and the editor refuses to save until it is zero.
 */
export interface Transaction {
  id: string
  date: IsoDate
  merchant: string
  amountCents: number
  splits: Split[]
}

/**
 * A row as the bank wrote it, with `transactionId` set once it has been linked
 * to a budgeted transaction. The unlinked ones are the work queue: everything
 * the bank saw that the budget has not accounted for yet.
 */
export interface ImportedTransaction {
  id: string
  bankAccountId: string
  date: IsoDate
  merchant: string
  amountCents: number
  transactionId: string | null
}

/** A regular expression over the merchant, proposing a budget for a match. */
export interface AutoLinkExpression {
  id: string
  expression: string
  budgetId: string
}
