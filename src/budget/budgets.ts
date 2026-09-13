/**
 * The envelope maths: what each budget has been given, what has been charged
 * against it, and what is left.
 *
 * A budget is an envelope that gets topped up by `amountCents` at the start of
 * every month from its `startDate` onwards, and the balance carries forward —
 * an under-spent month funds a heavy one later, which is the whole point of
 * budgeting this way rather than resetting to zero each month. So "available"
 * is the full history, not this month's figure: allowance times the number of
 * months elapsed, plus every split ever charged.
 *
 * Splits carry the sign: spending is negative, a refund or income positive. The
 * sums are therefore plain additions, and every value stays an integer.
 */
import {
  compareYearMonth,
  monthsBetween,
  monthsElapsed,
  yearMonthOf,
  type YearMonth,
} from './dates'
import type { Budget, IsoDate } from './types'

/** A split lifted out of its transaction, carrying the date it happened on. */
export interface DatedSplit {
  budgetId: string
  amountCents: number
  date: IsoDate
}

export interface BudgetMonth extends YearMonth {
  /** What the envelope was topped up by this month; zero before it started. */
  allowanceCents: number
  /** The signed sum of the splits charged this month. */
  spentCents: number
  /** `allowanceCents + spentCents`: this month alone, ignoring carry-over. */
  netCents: number
}

export interface BudgetSummary {
  budget: Budget
  /** Every top-up since the budget started. */
  allowanceCents: number
  /** The signed sum of every split ever charged to it. */
  spentCents: number
  /** What is left in the envelope: `allowanceCents + spentCents`. */
  availableCents: number
  /** Newest month first, which is the order the dashboard reads them in. */
  months: BudgetMonth[]
}

/**
 * Summarises every budget against the splits charged to it.
 *
 * `asOf` is normally today; it is a parameter so the result is a pure function
 * of its inputs and can be tested without stubbing the clock.
 *
 * The month rows span from the earlier of the budget's start and its oldest
 * split through to `asOf`, so a transaction back-dated before the budget
 * existed still appears — with a zero allowance for that month — rather than
 * being dropped. The totals count every split either way, which is what keeps
 * `availableCents` equal to the sum of the rows.
 */
export function summarizeBudgets(
  budgets: readonly Budget[],
  splits: readonly DatedSplit[],
  asOf: IsoDate,
): BudgetSummary[] {
  const asOfMonth = yearMonthOf(asOf)

  const splitsByBudget = new Map<string, DatedSplit[]>()
  for (const split of splits) {
    const existing = splitsByBudget.get(split.budgetId)
    if (existing) existing.push(split)
    else splitsByBudget.set(split.budgetId, [split])
  }

  return budgets.map((budget) =>
    summarizeBudget(budget, splitsByBudget.get(budget.id) ?? [], asOfMonth),
  )
}

function summarizeBudget(
  budget: Budget,
  splits: readonly DatedSplit[],
  asOfMonth: YearMonth,
): BudgetSummary {
  const startMonth = yearMonthOf(budget.startDate)

  const spentByMonth = new Map<string, number>()
  let spentCents = 0
  let earliestMonth = startMonth

  for (const split of splits) {
    const month = yearMonthOf(split.date)
    const key = `${month.year}-${month.month}`
    spentByMonth.set(key, (spentByMonth.get(key) ?? 0) + split.amountCents)
    spentCents += split.amountCents
    if (compareYearMonth(month, earliestMonth) < 0) earliestMonth = month
  }

  const allowanceCents =
    budget.amountCents * monthsElapsed(startMonth, asOfMonth)

  const months = monthsBetween(earliestMonth, asOfMonth).map((month) => {
    // A month before the budget started got no top-up, but may still hold a
    // back-dated split.
    const allowance =
      compareYearMonth(month, startMonth) < 0 ? 0 : budget.amountCents
    const spent = spentByMonth.get(`${month.year}-${month.month}`) ?? 0

    return {
      ...month,
      allowanceCents: allowance,
      spentCents: spent,
      netCents: allowance + spent,
    }
  })
  months.reverse()

  return {
    budget,
    allowanceCents,
    spentCents,
    availableCents: allowanceCents + spentCents,
    months,
  }
}
