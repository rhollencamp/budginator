import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor, within } from '../test/render'
import { LinkView } from './LinkView'
import type { Budget, ImportedTransaction } from '../budget/types'

const budgets: Budget[] = [
  {
    id: 'groceries',
    name: 'Groceries',
    icon: '🛒',
    amountCents: 50000,
    startDate: '2024-01-01',
  },
  {
    id: 'fuel',
    name: 'Fuel',
    icon: '⛽',
    amountCents: 20000,
    startDate: '2024-01-01',
  },
]

const imported: ImportedTransaction[] = [
  {
    id: 'i1',
    bankAccountId: 'b1',
    date: '2024-03-05',
    merchant: 'SUPERMARKET',
    amountCents: -10000,
    transactionId: null,
  },
  {
    id: 'i2',
    bankAccountId: 'b1',
    date: '2024-03-06',
    merchant: 'SHELL OIL',
    amountCents: -4500,
    transactionId: null,
  },
  {
    id: 'i3',
    bankAccountId: 'b1',
    date: '2024-03-07',
    merchant: 'CORNER SHOP',
    amountCents: -300,
    transactionId: null,
  },
]

/**
 * StrictMode is what pins the note field: it invokes a `useState` updater a
 * second time during render, which is exactly the moment React has already
 * cleared the event's `currentTarget`. A handler that reads the event inside
 * the updater throws here rather than only on the unlucky keystroke.
 */
function setup() {
  const onLinkToBudgets = vi.fn().mockResolvedValue(null)

  render(
    <StrictMode>
      <LinkView
        imported={imported}
        transactions={[]}
        budgets={budgets}
        onLinkToBudgets={onLinkToBudgets}
        onLinkToTransaction={vi.fn().mockResolvedValue(null)}
      />
    </StrictMode>,
  )

  return { onLinkToBudgets }
}

/** Picks a budget on the card for an imported row, by its merchant. */
async function chooseBudget(
  user: ReturnType<typeof userEvent.setup>,
  merchant: string,
  budget: string,
) {
  const card = screen.getByText(merchant).closest('.mantine-Card-root')
  if (!(card instanceof HTMLElement)) throw new Error(`no card for ${merchant}`)

  const input = within(card).getByPlaceholderText('Pick a budget')
  await user.click(input)

  // Every row has its own Select, and each renders its full option list, so
  // the options have to be looked up inside this one's dropdown rather than
  // by text across the document.
  const dropdown = document.getElementById(
    input.getAttribute('aria-controls') ?? '',
  )
  if (!dropdown) throw new Error(`no dropdown for ${merchant}`)

  await user.click(await within(dropdown).findByText(budget))
}

describe('LinkView', () => {
  it('budgets every chosen row in one call, with the notes that were typed', async () => {
    const user = userEvent.setup()
    const { onLinkToBudgets } = setup()

    await chooseBudget(user, 'SUPERMARKET', '🛒 Groceries')
    await user.type(
      screen.getAllByPlaceholderText('Note (optional)')[0],
      'weekly shop',
    )
    await chooseBudget(user, 'SHELL OIL', '⛽ Fuel')

    await user.click(
      screen.getByRole('button', { name: 'Budget 2 transactions' }),
    )

    await waitFor(() => expect(onLinkToBudgets).toHaveBeenCalledTimes(1))
    // The third row had no budget picked, so it is not in the batch.
    expect(onLinkToBudgets).toHaveBeenCalledWith([
      { importedId: 'i1', budgetId: 'groceries', note: 'weekly shop' },
      { importedId: 'i2', budgetId: 'fuel', note: '' },
    ])
  })

  it('will not save until a budget has been picked', async () => {
    const user = userEvent.setup()
    setup()

    const button = screen.getByRole('button', { name: 'Budget 0 transactions' })
    expect(button).toBeDisabled()

    await chooseBudget(user, 'CORNER SHOP', '🛒 Groceries')
    expect(
      screen.getByRole('button', { name: 'Budget 1 transaction' }),
    ).toBeEnabled()
  })

  it('offers no way to discard a bank row', () => {
    setup()

    expect(
      screen.queryByRole('button', { name: /discard/i }),
    ).not.toBeInTheDocument()
  })
})
