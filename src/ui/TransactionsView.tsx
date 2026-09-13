import { useMemo, useState } from 'react'
import {
  Anchor,
  Badge,
  Card,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { amountForBudget, touchesBudget } from '../budget/transactions'
import type { Budget, ImportedTransaction, Transaction } from '../budget/types'
import { Amount } from './Amount'

interface TransactionsViewProps {
  transactions: readonly Transaction[]
  budgets: readonly Budget[]
  imported: readonly ImportedTransaction[]
  budgetId?: string
  onFilter: (budgetId?: string) => void
  onEdit: (transactionId: string) => void
}

/**
 * The ledger: every transaction, newest first, optionally filtered to one
 * budget.
 *
 * When filtered, the figure shown is what this transaction put against *that*
 * budget rather than its total — a £100 supermarket run split £70 groceries
 * and £30 presents reads as £70 under Groceries, which is the number that
 * budget's balance was moved by.
 */
export function TransactionsView({
  transactions,
  budgets,
  imported,
  budgetId,
  onFilter,
  onEdit,
}: TransactionsViewProps) {
  const [search, setSearch] = useState('')

  const budgetNames = useMemo(
    () => new Map(budgets.map((budget) => [budget.id, budget])),
    [budgets],
  )

  // Which transactions came from the bank, so a linked one can say so: it
  // cannot be freely edited without the two disagreeing.
  const linkedIds = useMemo(
    () =>
      new Set(
        imported
          .map((row) => row.transactionId)
          .filter((id): id is string => id !== null),
      ),
    [imported],
  )

  const query = search.trim().toLowerCase()
  const visible = transactions.filter((transaction) => {
    if (budgetId && !touchesBudget(transaction, budgetId)) return false
    if (query === '') return true

    return (
      transaction.merchant.toLowerCase().includes(query) ||
      transaction.splits.some((split) =>
        split.note.toLowerCase().includes(query),
      )
    )
  })

  const total = visible.reduce(
    (sum, transaction) =>
      sum +
      (budgetId
        ? amountForBudget(transaction, budgetId)
        : transaction.amountCents),
    0,
  )

  return (
    <Stack gap="md">
      <Select
        label="Budget"
        placeholder="All budgets"
        clearable
        searchable
        value={budgetId ?? null}
        onChange={(value) => onFilter(value ?? undefined)}
        data={budgets.map((budget) => ({
          value: budget.id,
          label: `${budget.icon} ${budget.name}`.trim(),
        }))}
      />

      <TextInput
        label="Search"
        placeholder="Merchant or note"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {visible.length}{' '}
          {visible.length === 1 ? 'transaction' : 'transactions'}
        </Text>
        <Text size="sm" c="dimmed">
          Total <Amount cents={total} colored />
        </Text>
      </Group>

      {visible.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          Nothing here yet.
        </Text>
      )}

      {/* Cards rather than table rows: a transaction has a merchant, a date, an
          amount and a list of splits, which is more than fits across a phone
          and reads badly as a row that has to scroll sideways. */}
      {visible.map((transaction) => {
        const shown = budgetId
          ? amountForBudget(transaction, budgetId)
          : transaction.amountCents

        return (
          <Card key={transaction.id} withBorder padding="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Anchor
                  component="button"
                  type="button"
                  fw={500}
                  ta="left"
                  onClick={() => onEdit(transaction.id)}
                >
                  {transaction.merchant || '(no merchant)'}
                </Anchor>
                <Text size="sm" c="dimmed">
                  {transaction.date}
                  {linkedIds.has(transaction.id) && ' · from the bank'}
                </Text>
              </Stack>

              <Amount cents={shown} fw={600} />
            </Group>

            {/* The splits are what the budgets actually saw, so they are shown
                whenever there is more than one, or when looking at everything
                at once and the budget would otherwise be invisible. */}
            {(transaction.splits.length > 1 || !budgetId) && (
              <Group gap="xs" mt="xs">
                {transaction.splits.map((split) => {
                  const budget = budgetNames.get(split.budgetId)

                  return (
                    <Badge key={split.id} radius="sm" variant="default">
                      {budget ? `${budget.icon} ${budget.name}` : 'Unknown'}
                      {transaction.splits.length > 1 && (
                        <>
                          {' '}
                          <Amount cents={split.amountCents} span />
                        </>
                      )}
                    </Badge>
                  )
                })}
              </Group>
            )}
          </Card>
        )
      })}
    </Stack>
  )
}
