/**
 * The screens, and the whole navigation model.
 *
 * There is no router: `App` holds one `Screen` value and the drawer switches
 * it, the way the `idle` repo does. A budgeting app is a handful of screens
 * reached from a menu, and a router would buy deep links into a private
 * ledger that nobody shares — while costing the thing that actually matters
 * here, which is that an installed PWA relaunches at the top rather than on
 * whatever half-finished screen it was killed on.
 *
 * `Screen` carries its parameters in the value rather than in a URL, so
 * "transactions, filtered to this budget" and "edit this transaction" are
 * ordinary states rather than parsed strings.
 */

/** The screens the drawer lists, in the order it lists them. */
export const VIEWS = [
  { key: 'dashboard', label: 'Budgets', title: 'Budginator' },
  { key: 'track', label: 'Track', title: 'Track Spending' },
  { key: 'transactions', label: 'Transactions', title: 'Transactions' },
  { key: 'import', label: 'Import', title: 'Import' },
  { key: 'link', label: 'Link', title: 'Link Transactions' },
  { key: 'autoLink', label: 'Auto Link', title: 'Auto Link' },
  { key: 'setup', label: 'Setup', title: 'Setup' },
  { key: 'settings', label: 'Settings', title: 'Settings' },
] as const

export type View = (typeof VIEWS)[number]['key']

/**
 * A screen and its parameters. `editTransaction` is reached from a list rather
 * than from the menu, which is why it is here but not in `VIEWS`.
 */
export type Screen =
  | { view: 'dashboard' }
  | { view: 'track'; budgetId?: string }
  | { view: 'transactions'; budgetId?: string }
  | { view: 'editTransaction'; transactionId: string }
  | { view: 'import' }
  | { view: 'link' }
  | { view: 'autoLink' }
  | { view: 'setup' }
  | { view: 'settings' }

export const HOME: Screen = { view: 'dashboard' }

export function screenTitle(screen: Screen): string {
  if (screen.view === 'editTransaction') return 'Edit Transaction'

  return VIEWS.find((entry) => entry.key === screen.view)?.title ?? 'Budginator'
}
