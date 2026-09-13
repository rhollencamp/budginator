import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor, within } from '../test/render'
import { SetupView } from './SetupView'
import type {
  AutoLinkExpression,
  BankAccount,
  Budget,
  ImportedTransaction,
  Transaction,
} from '../budget/types'

const groceries: Budget = {
  id: 'groceries',
  name: 'Groceries',
  icon: '🛒',
  amountCents: 50000,
  startDate: '2024-01-01',
}

const current: BankAccount = { id: 'a1', name: 'Current', multiplier: 1 }
const savings: BankAccount = { id: 'a2', name: 'Savings', multiplier: -1 }

const rule: AutoLinkExpression = {
  id: 'r1',
  expression: 'COSTCU',
  budgetId: 'groceries',
}

const linkedTransaction: Transaction = {
  id: 't1',
  date: '2024-03-05',
  merchant: 'SUPERMARKET',
  amountCents: -10000,
  splits: [{ id: 's1', budgetId: 'groceries', amountCents: -10000, note: '' }],
}

const linkedRow: ImportedTransaction = {
  id: 'i1',
  bankAccountId: 'a1',
  date: '2024-03-05',
  merchant: 'SUPERMARKET #12',
  amountCents: -10000,
  transactionId: 't1',
}

const unlinkedRow: ImportedTransaction = {
  id: 'i2',
  bankAccountId: 'a2',
  date: '2024-03-09',
  merchant: 'PETROL STATION',
  amountCents: -4500,
  transactionId: null,
}

function setup(initialTab: string) {
  const handlers = {
    onSaveBudget: vi.fn().mockResolvedValue(null),
    onDeleteBudget: vi.fn().mockResolvedValue(null),
    onSaveAccount: vi.fn().mockResolvedValue(null),
    onDeleteAccount: vi.fn().mockResolvedValue(null),
    onSaveExpression: vi.fn().mockResolvedValue(null),
    onDeleteExpression: vi.fn().mockResolvedValue(null),
    onSaveImported: vi.fn().mockResolvedValue(null),
    onUnlinkImported: vi.fn().mockResolvedValue(null),
    onDeleteImported: vi.fn().mockResolvedValue(null),
  }

  render(
    <SetupView
      budgets={[groceries]}
      accounts={[current, savings]}
      expressions={[rule]}
      imported={[linkedRow, unlinkedRow]}
      transactions={[linkedTransaction]}
      initialTab={initialTab}
      {...handlers}
    />,
  )

  return handlers
}

/** The card a row's merchant text appears in. */
function cardFor(text: string): HTMLElement {
  const label = screen.getByText(text)
  const card = label.closest('.mantine-Card-root')

  if (!(card instanceof HTMLElement)) throw new Error(`No card for ${text}`)

  return card
}

describe('SetupView rules', () => {
  it('saves an edited rule against its own id rather than creating a new one', async () => {
    const user = userEvent.setup()
    const { onSaveExpression } = setup('rules')

    await user.click(screen.getByRole('button', { name: 'Edit' }))

    const pattern = await screen.findByLabelText(/pattern/i)
    expect(pattern).toHaveValue('COSTCU')

    await user.clear(pattern)
    await user.type(pattern, 'COSTCO')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaveExpression).toHaveBeenCalledTimes(1))
    expect(onSaveExpression).toHaveBeenCalledWith({
      id: 'r1',
      expression: 'COSTCO',
      budgetId: 'groceries',
    })
  })

  it('still creates with a null id when adding', async () => {
    const user = userEvent.setup()
    const { onSaveExpression } = setup('rules')

    await user.click(screen.getByRole('button', { name: /new rule/i }))
    await user.type(await screen.findByLabelText(/pattern/i), 'SHELL')
    // Mantine renders its dropdown options as plain elements rather than with
    // an `option` role, so the option is found by the text it shows.
    await user.click(screen.getByRole('combobox', { name: /budget/i }))
    await user.click(await screen.findByText('🛒 Groceries'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaveExpression).toHaveBeenCalledTimes(1))
    expect(onSaveExpression.mock.calls[0][0]).toMatchObject({ id: null })
  })

  it('refuses a pattern that is not a valid regular expression', async () => {
    const user = userEvent.setup()
    setup('rules')

    await user.click(screen.getByRole('button', { name: /new rule/i }))
    await user.type(await screen.findByLabelText(/pattern/i), '*(')

    expect(
      await screen.findByText(/not a valid regular expression/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('SetupView imported transactions', () => {
  it('lists linked rows as well as unlinked ones', () => {
    setup('imported')

    expect(screen.getByText('SUPERMARKET #12')).toBeInTheDocument()
    expect(screen.getByText('PETROL STATION')).toBeInTheDocument()
  })

  it('says which budget a linked row ended up in', () => {
    setup('imported')

    expect(
      within(cardFor('SUPERMARKET #12')).getByText(/🛒 Groceries/),
    ).toBeInTheDocument()
    expect(
      within(cardFor('PETROL STATION')).getByText('Unlinked'),
    ).toBeInTheDocument()
  })

  it('offers unlink only for a row that is linked', () => {
    setup('imported')

    expect(
      within(cardFor('SUPERMARKET #12')).getByRole('button', {
        name: 'Unlink',
      }),
    ).toBeInTheDocument()
    expect(
      within(cardFor('PETROL STATION')).queryByRole('button', {
        name: 'Unlink',
      }),
    ).not.toBeInTheDocument()
  })

  it('unlinks the row it was pressed on', async () => {
    const user = userEvent.setup()
    const { onUnlinkImported } = setup('imported')

    await user.click(
      within(cardFor('SUPERMARKET #12')).getByRole('button', {
        name: 'Unlink',
      }),
    )

    await waitFor(() => expect(onUnlinkImported).toHaveBeenCalledWith('i1'))
  })

  it('filters to the unlinked rows', async () => {
    const user = userEvent.setup()
    setup('imported')

    await user.click(screen.getByRole('radio', { name: 'Unlinked' }))

    await waitFor(() =>
      expect(screen.queryByText('SUPERMARKET #12')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('PETROL STATION')).toBeInTheDocument()
  })

  it('searches by merchant', async () => {
    const user = userEvent.setup()
    setup('imported')

    await user.type(screen.getByLabelText('Search'), 'petrol')

    await waitFor(() =>
      expect(screen.queryByText('SUPERMARKET #12')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('PETROL STATION')).toBeInTheDocument()
  })

  it('seeds the edit form from the row and saves against its id', async () => {
    const user = userEvent.setup()
    const { onSaveImported } = setup('imported')

    await user.click(
      within(cardFor('PETROL STATION')).getByRole('button', { name: 'Edit' }),
    )

    expect(await screen.findByLabelText(/merchant/i)).toHaveValue(
      'PETROL STATION',
    )
    expect(screen.getByLabelText(/amount/i)).toHaveValue('-45.00')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaveImported).toHaveBeenCalledTimes(1))
    expect(onSaveImported).toHaveBeenCalledWith({
      id: 'i2',
      bankAccountId: 'a2',
      date: '2024-03-09',
      merchant: 'PETROL STATION',
      amountCents: -4500,
    })
  })

  it('warns before editing a row that is still linked', async () => {
    const user = userEvent.setup()
    setup('imported')

    await user.click(
      within(cardFor('SUPERMARKET #12')).getByRole('button', { name: 'Edit' }),
    )

    expect(
      await screen.findByText(/will make the two disagree/i),
    ).toBeInTheDocument()
  })

  it('deletes the row it was pressed on', async () => {
    const user = userEvent.setup()
    const { onDeleteImported } = setup('imported')

    await user.click(
      within(cardFor('PETROL STATION')).getByRole('button', { name: 'Delete' }),
    )

    await waitFor(() => expect(onDeleteImported).toHaveBeenCalledWith('i2'))
  })
})
