import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../test/render'
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
]

/**
 * StrictMode is what pins the note field: it invokes a `useState` updater a
 * second time during render, which is exactly the moment React has already
 * cleared the event's `currentTarget`. A handler that reads the event inside
 * the updater throws here rather than only on the unlucky keystroke.
 */
function setup() {
  const onLinkToBudget = vi.fn().mockResolvedValue(null)

  render(
    <StrictMode>
      <LinkView
        imported={imported}
        transactions={[]}
        budgets={budgets}
        onLinkToBudget={onLinkToBudget}
        onLinkToTransaction={vi.fn().mockResolvedValue(null)}
        onDiscard={vi.fn().mockResolvedValue(null)}
      />
    </StrictMode>,
  )

  return { onLinkToBudget }
}

describe('LinkView', () => {
  it('budgets an imported row with the note that was typed', async () => {
    const user = userEvent.setup()
    const { onLinkToBudget } = setup()

    await user.click(screen.getByPlaceholderText('Pick a budget'))
    await user.click(await screen.findByText('🛒 Groceries'))
    await user.type(screen.getByPlaceholderText('Note (optional)'), 'milk')
    await user.click(screen.getByRole('button', { name: 'Budget it' }))

    await waitFor(() =>
      expect(onLinkToBudget).toHaveBeenCalledWith('i1', 'groceries', 'milk'),
    )
  })
})
