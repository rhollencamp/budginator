/**
 * Pairing imported bank rows with transactions that were entered by hand.
 *
 * The same purchase can arrive twice: once when it is typed in at the shop,
 * and again a few days later when the bank posts it. Linking marks the pair as
 * one event, so the budget is not charged twice and the imported row leaves
 * the unlinked queue.
 *
 * A suggestion is only ever a suggestion — the link is made when the user
 * accepts it — but a list full of wrong guesses is worse than a short one, so
 * the rules here are deliberately tight: the amounts must be equal to the
 * cent, the dates must be close, and a pair is only offered when neither side
 * has a better partner.
 */
import type { ImportedTransaction, IsoDate, Transaction } from './types'

/** How far apart a hand-entered date and a posting date may be, in days. */
export const MAX_LINK_DAYS = 5

export interface LinkSuggestion {
  imported: ImportedTransaction
  transaction: Transaction
  /** Whole days between the two dates; 0 when they fall on the same day. */
  daysApart: number
}

/** Whole days between two calendar dates, read in UTC so no offset shifts it. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)
  return Math.round(Math.abs(ms) / 86_400_000)
}

/**
 * Proposes links between unlinked imported rows and transactions that no
 * import is attached to yet.
 *
 * Candidates are matched on exact amount and a date within `MAX_LINK_DAYS`,
 * then taken closest-date first, each row and each transaction used at most
 * once. That ordering is what stops a run of identical subscriptions from all
 * pointing at the same January charge: the nearest pair claims each other and
 * the rest fall to the next-nearest.
 */
export function suggestLinks(
  imported: readonly ImportedTransaction[],
  transactions: readonly Transaction[],
): LinkSuggestion[] {
  const unlinked = imported.filter((row) => row.transactionId === null)

  const candidates: LinkSuggestion[] = []
  for (const row of unlinked) {
    for (const transaction of transactions) {
      if (transaction.amountCents !== row.amountCents) continue

      const daysApart = daysBetween(row.date, transaction.date)
      if (daysApart > MAX_LINK_DAYS) continue

      candidates.push({ imported: row, transaction, daysApart })
    }
  }

  // Closest first; ties broken on the dates themselves so the result does not
  // depend on the order the rows came out of the database.
  candidates.sort(
    (a, b) =>
      a.daysApart - b.daysApart ||
      a.imported.date.localeCompare(b.imported.date) ||
      a.imported.id.localeCompare(b.imported.id),
  )

  const usedImported = new Set<string>()
  const usedTransactions = new Set<string>()
  const suggestions: LinkSuggestion[] = []

  for (const candidate of candidates) {
    if (usedImported.has(candidate.imported.id)) continue
    if (usedTransactions.has(candidate.transaction.id)) continue

    usedImported.add(candidate.imported.id)
    usedTransactions.add(candidate.transaction.id)
    suggestions.push(candidate)
  }

  return suggestions
}

/**
 * The transactions that could still take a link: those no imported row points
 * at. The caller passes every transaction and every imported row, because
 * "unlinked" is a property of the pair rather than of the transaction.
 */
export function unlinkedTransactions(
  transactions: readonly Transaction[],
  imported: readonly ImportedTransaction[],
): Transaction[] {
  const linked = new Set(
    imported
      .map((row) => row.transactionId)
      .filter((id): id is string => id !== null),
  )

  return transactions.filter((transaction) => !linked.has(transaction.id))
}
