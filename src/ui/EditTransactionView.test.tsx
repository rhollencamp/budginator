import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../test/render'
import { EditTransactionView } from './EditTransactionView'
import type { Budget, Transaction } from '../budget/types'

const budgets: Budget[] = [
  {
    id: 'groceries',
    name: 'Groceries',
    icon: '🛒',
    amountCents: 50000,
    startDate: '2024-01-01',
  },
  {
    id: 'gifts',
    name: 'Gifts',
    icon: '🎁',
    amountCents: 10000,
    startDate: '2024-01-01',
  },
]

const transaction: Transaction = {
  id: 't1',
  date: '2024-03-05',
  merchant: 'SUPERMARKET',
  amountCents: -10000,
  splits: [
    { id: 's1', budgetId: 'groceries', amountCents: -10000, note: 'weekly' },
  ],
}

function setup(overrides: Partial<Transaction> = {}) {
  const onSave = vi.fn().mockResolvedValue(null)
  const onDelete = vi.fn().mockResolvedValue(null)
  const onDone = vi.fn()

  render(
    <EditTransactionView
      transaction={{ ...transaction, ...overrides }}
      budgets={budgets}
      onSave={onSave}
      onDelete={onDelete}
      onDone={onDone}
    />,
  )

  return { onSave, onDelete, onDone }
}

describe('EditTransactionView', () => {
  it('opens with the transaction balanced and saveable', () => {
    setup()

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(screen.queryByText(/do not add up/i)).not.toBeInTheDocument()
  })

  it('refuses to save while the splits do not account for the total', async () => {
    const user = userEvent.setup()
    const { onSave } = setup()

    const total = screen.getByLabelText(/total/i)
    await user.clear(total)
    await user.type(total, '-150.00')

    expect(await screen.findByText(/do not add up/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('names the exact shortfall, to the cent', async () => {
    const user = userEvent.setup()
    setup()

    const total = screen.getByLabelText(/total/i)
    await user.clear(total)
    await user.type(total, '-100.01')

    expect(await screen.findByText(/\$0\.01/)).toBeInTheDocument()
  })

  it('closes the gap when the remainder is added to the last split', async () => {
    const user = userEvent.setup()
    setup()

    const total = screen.getByLabelText(/total/i)
    await user.clear(total)
    await user.type(total, '-120.00')

    await user.click(
      await screen.findByRole('button', { name: /add it to the last split/i }),
    )

    await waitFor(() =>
      expect(screen.queryByText(/do not add up/i)).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('saves the splits as integer cents', async () => {
    const user = userEvent.setup()
    const { onSave } = setup()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({
      id: 't1',
      amountCents: -10000,
      splits: [{ budgetId: 'groceries', amountCents: -10000, note: 'weekly' }],
    })
  })

  it('will not save a transaction with no splits at all', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: /remove this split/i }))

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('warns that editing a bank-linked transaction will break the match', () => {
    render(
      <EditTransactionView
        transaction={transaction}
        budgets={budgets}
        linkedImport={{
          id: 'i1',
          bankAccountId: 'a1',
          date: '2024-03-07',
          merchant: 'SUPERMARKET #12',
          amountCents: -10000,
          transactionId: 't1',
        }}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDone={vi.fn()}
      />,
    )

    expect(
      screen.getByText(/linked to a bank transaction/i),
    ).toBeInTheDocument()
  })
})
