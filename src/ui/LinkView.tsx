import { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { suggestLinks, unlinkedTransactions } from '../budget/linking'
import type { Budget, ImportedTransaction, Transaction } from '../budget/types'
import { Amount } from './Amount'
import { BudgetSelect } from './BudgetSelect'

interface LinkViewProps {
  imported: readonly ImportedTransaction[]
  transactions: readonly Transaction[]
  budgets: readonly Budget[]
  onLinkToBudget: (
    importedId: string,
    budgetId: string,
    note: string,
  ) => Promise<string | null>
  onLinkToTransaction: (
    importedId: string,
    transactionId: string,
  ) => Promise<string | null>
  onDiscard: (importedId: string) => Promise<string | null>
}

/**
 * The unlinked queue: everything the bank has reported that the budget has not
 * accounted for yet.
 *
 * There are two ways a row leaves. Either it is the same purchase as something
 * already entered by hand — the suggestions at the top, matched on amount and a
 * nearby date — in which case linking the two records one event rather than
 * two. Or it is new, and picking a budget turns it into a transaction.
 */
export function LinkView({
  imported,
  transactions,
  budgets,
  onLinkToBudget,
  onLinkToTransaction,
  onDiscard,
}: LinkViewProps) {
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [budgetChoice, setBudgetChoice] = useState<
    Record<string, string | null>
  >({})
  const [notes, setNotes] = useState<Record<string, string>>({})

  const unlinked = imported.filter((row) => row.transactionId === null)
  const suggestions = suggestLinks(
    imported,
    unlinkedTransactions(transactions, imported),
  )

  const act = async (id: string, action: () => Promise<string | null>) => {
    setBusyId(id)
    const failure = await action()
    setBusyId(null)
    setError(failure)
  }

  if (unlinked.length === 0) {
    return (
      <Alert title="Nothing waiting" variant="light">
        Every imported transaction has been accounted for.
      </Alert>
    )
  }

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" title="Could not link" variant="light">
          {error}
        </Alert>
      )}

      {suggestions.length > 0 && (
        <>
          <Text fw={600}>Looks like the same purchase, entered twice</Text>

          {suggestions.map((suggestion) => (
            <Card key={suggestion.imported.id} withBorder padding="sm">
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" lineClamp={1}>
                    Bank: {suggestion.imported.merchant || '(no merchant)'}
                  </Text>
                  <Amount cents={suggestion.imported.amountCents} />
                </Group>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" c="dimmed" lineClamp={1}>
                    Entered:{' '}
                    {suggestion.transaction.merchant || '(no merchant)'}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {suggestion.transaction.date}
                  </Text>
                </Group>

                <Group gap="xs">
                  <Badge variant="default" radius="sm">
                    {suggestion.daysApart === 0
                      ? 'same day'
                      : `${suggestion.daysApart} day${suggestion.daysApart === 1 ? '' : 's'} apart`}
                  </Badge>
                  <Button
                    size="compact-sm"
                    loading={busyId === suggestion.imported.id}
                    onClick={() =>
                      act(suggestion.imported.id, () =>
                        onLinkToTransaction(
                          suggestion.imported.id,
                          suggestion.transaction.id,
                        ),
                      )
                    }
                  >
                    Same purchase
                  </Button>
                </Group>
              </Stack>
            </Card>
          ))}
        </>
      )}

      <Text fw={600}>Waiting to be budgeted ({unlinked.length})</Text>

      {unlinked.map((row) => (
        <Card key={row.id} withBorder padding="sm">
          <Stack gap="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Text fw={500} lineClamp={2}>
                  {row.merchant || '(no merchant)'}
                </Text>
                <Text size="sm" c="dimmed">
                  {row.date}
                </Text>
              </Stack>
              <Amount cents={row.amountCents} fw={600} />
            </Group>

            <BudgetSelect
              budgets={budgets}
              label={undefined}
              value={budgetChoice[row.id] ?? null}
              onChange={(value) =>
                setBudgetChoice((current) => ({ ...current, [row.id]: value }))
              }
            />

            <TextInput
              placeholder="Note (optional)"
              value={notes[row.id] ?? ''}
              onChange={(event) =>
                setNotes((current) => ({
                  ...current,
                  [row.id]: event.currentTarget.value,
                }))
              }
            />

            <Group gap="xs">
              <Button
                size="compact-sm"
                disabled={!budgetChoice[row.id]}
                loading={busyId === row.id}
                onClick={() =>
                  act(row.id, () =>
                    onLinkToBudget(
                      row.id,
                      budgetChoice[row.id] as string,
                      notes[row.id] ?? '',
                    ),
                  )
                }
              >
                Budget it
              </Button>

              {/* For a row that should never have been imported — a transfer
                  between your own accounts, a duplicate the bank posted twice.
                  It deletes the bank row, not a transaction, so nothing that
                  has been budgeted can be lost this way. */}
              <Button
                size="compact-sm"
                variant="subtle"
                color="red"
                loading={busyId === row.id}
                onClick={() => act(row.id, () => onDiscard(row.id))}
              >
                Discard
              </Button>
            </Group>
          </Stack>
        </Card>
      ))}
    </Stack>
  )
}
