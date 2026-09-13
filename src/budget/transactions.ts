/**
 * Splitting a transaction across budgets.
 *
 * One receipt is often several budgets: a supermarket run that is mostly
 * groceries and partly a birthday present. The transaction holds the amount
 * the bank moved; the splits say where it went. The two must agree, or the
 * budgets no longer add up to the money that actually left the account — so
 * the editor will not save a transaction whose splits do not sum to its total.
 *
 * The remainder is computed in cents and is therefore exact: there is no
 * tolerance to tune, and "close enough" never arises.
 */
import { sumCents } from './money'
import type { Split, Transaction } from './types'

/** A split as the editor holds it, before it has been saved an id. */
export interface DraftSplit {
  budgetId: string | null
  amountCents: number
  note: string
}

/**
 * What is left of the transaction after the splits: zero when they balance,
 * positive when the splits do not yet account for all of it.
 */
export function splitRemainder(
  amountCents: number,
  splits: readonly { amountCents: number }[],
): number {
  return amountCents - sumCents(splits.map((split) => split.amountCents))
}

/** Whether a set of splits accounts for the transaction exactly. */
export function splitsBalance(
  amountCents: number,
  splits: readonly { amountCents: number }[],
): boolean {
  return splitRemainder(amountCents, splits) === 0
}

/**
 * Every split of every transaction, flattened and carrying its transaction's
 * date — the shape `summarizeBudgets` works in.
 */
export function datedSplits(transactions: readonly Transaction[]) {
  return transactions.flatMap((transaction) =>
    transaction.splits.map((split) => ({
      budgetId: split.budgetId,
      amountCents: split.amountCents,
      date: transaction.date,
    })),
  )
}

/** The budgets a transaction touches, in split order and without repeats. */
export function budgetIdsOf(transaction: Transaction): string[] {
  return [...new Set(transaction.splits.map((split) => split.budgetId))]
}

/** Whether any of a transaction's splits is charged to the given budget. */
export function touchesBudget(
  transaction: Transaction,
  budgetId: string,
): boolean {
  return transaction.splits.some((split) => split.budgetId === budgetId)
}

/**
 * The signed total a transaction puts against one budget. A transaction split
 * twice onto the same budget counts both times.
 */
export function amountForBudget(
  transaction: Transaction,
  budgetId: string,
): number {
  return sumCents(
    transaction.splits
      .filter((split) => split.budgetId === budgetId)
      .map((split) => split.amountCents),
  )
}

/**
 * The splits a single-budget transaction starts life with — what the quick
 * entry screen creates, and what an imported row gets when it is linked
 * straight to a budget.
 */
export function singleSplit(
  budgetId: string,
  amountCents: number,
  note: string,
): DraftSplit {
  return { budgetId, amountCents, note }
}

/** Drops the saved-row fields, leaving the shape the editor works in. */
export function toDraft(split: Split): DraftSplit {
  return {
    budgetId: split.budgetId,
    amountCents: split.amountCents,
    note: split.note,
  }
}
