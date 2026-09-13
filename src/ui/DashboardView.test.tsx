import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '../test/render'
import { DashboardView } from './DashboardView'
import type { Budget, Transaction } from '../budget/types'

const groceries: Budget = {
  id: 'groceries',
  name: 'Groceries',
  icon: '🛒',
  amountCents: 50000,
  startDate: '2024-01-01',
}

/** A label rather than an envelope: no allowance to run down. */
const misc: Budget = {
  id: 'misc',
  name: 'Misc',
  icon: '❓',
  amountCents: 0,
  startDate: '2024-01-01',
}

function transaction(
  id: string,
  date: string,
  budgetId: string,
  amountCents: number,
): Transaction {
  return {
    id,
    date,
    merchant: 'SHOP',
    amountCents,
    splits: [{ id: `${id}-s`, budgetId, amountCents, note: '' }],
  }
}

function setup(budgets: Budget[], transactions: Transaction[]) {
  const onViewTransactions = vi.fn()
  const onTrack = vi.fn()
  const onSetUpBudgets = vi.fn()

  render(
    <DashboardView
      budgets={budgets}
      transactions={transactions}
      onViewTransactions={onViewTransactions}
      onTrack={onTrack}
      onSetUpBudgets={onSetUpBudgets}
    />,
  )

  return { onViewTransactions, onTrack, onSetUpBudgets }
}

/** The text of a budget's accordion header, where its badge lives. */
function headerFor(name: string): string {
  const control = screen
    .getAllByRole('button')
    .find((button) => button.textContent?.includes(name))

  if (!control) throw new Error(`No accordion header for ${name}`)

  return control.textContent ?? ''
}

describe('DashboardView', () => {
  it('invites the first budget when there are none', () => {
    setup([], [])

    expect(screen.getByText(/no budgets yet/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /create a budget/i }),
    ).toBeInTheDocument()
  })

  it('lists each budget with its icon and name', () => {
    setup([groceries, misc], [])

    expect(screen.getByText(/🛒 Groceries/)).toBeInTheDocument()
    expect(screen.getByText(/❓ Misc/)).toBeInTheDocument()
  })

  it('shows a spend total rather than a balance for a budget with no allowance', () => {
    setup([misc], [transaction('t1', '2024-03-05', 'misc', -1234)])

    // A zero-allowance budget has no envelope to run down, so the badge
    // carries what has gone through it. The panel below also lists the month,
    // so the assertion is scoped to the header the badge sits in.
    expect(headerFor('Misc')).toContain('-$12.34')
  })

  it('carries a negative balance on the badge when an envelope is overdrawn', () => {
    // Spent far beyond anything the allowance can have accrued, so the sign
    // does not depend on what today's date happens to be.
    setup(
      [groceries],
      [transaction('t1', '2024-01-05', 'groceries', -99_999_900)],
    )

    expect(headerFor('Groceries')).toMatch(/-\$/)
  })

  it('keeps a budget in credit positive', () => {
    setup([groceries], [transaction('t1', '2024-01-05', 'groceries', -100)])

    expect(headerFor('Groceries')).not.toMatch(/-\$/)
  })
})
