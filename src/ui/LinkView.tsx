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
  onLinkToBudgets: (
    links: { importedId: string; budgetId: string; note: string }[],
  ) => Promise<string | null>
  onLinkToTransaction: (
    importedId: string,
    transactionId: string,
  ) => Promise<string | null>
}

/**
 * The unlinked queue: everything the bank has reported that the budget has not
 * accounted for yet.
 *
 * There are two ways a row leaves. Either it is the same purchase as something
 * already entered by hand — the suggestions at the top, matched on amount and a
 * nearby date — in which case linking the two records one event rather than
 * two. Or it is new, and picking a budget turns it into a transaction.
 *
 * Budgeting is a batch: pick a budget against as many rows as you like and
 * press the one button at the bottom. Each row used to save on its own, which
 * meant a whole-ledger reload per row — and the list shifting under a thumb
 * between taps, with Discard sitting where the next row's budget had been.
 * One press means one write, one reload, and one moment where the queue
 * changes shape. It is also why there is no per-row Discard here any more:
 * deleting a bank row is a correction, it belongs on Setup's imported rows
 * beside the other corrections, and it has no place on a screen whose rows
 * are meant to be tapped through quickly.
 */
export function LinkView({
  imported,
  transactions,
  budgets,
  onLinkToBudgets,
  onLinkToTransaction,
}: LinkViewProps) {
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [budgetChoice, setBudgetChoice] = useState<
    Record<string, string | null>
  >({})
  const [notes, setNotes] = useState<Record<string, string>>({})

  const unlinked = imported.filter((row) => row.transactionId === null)
  const suggestions = suggestLinks(
    imported,
    unlinkedTransactions(transactions, imported),
  )

  // Only rows still in the queue count: a choice made against a row that
  // another session has since budgeted would otherwise be submitted for a row
  // that is no longer here. The database skips linked rows anyway, but the
  // count on the button should say what will actually happen.
  const chosen = unlinked.flatMap((row) => {
    const budgetId = budgetChoice[row.id]
    if (!budgetId) return []
    return [{ importedId: row.id, budgetId, note: notes[row.id] ?? '' }]
  })

  const acceptSuggestion = async (
    importedId: string,
    transactionId: string,
  ) => {
    setBusyId(importedId)
    const failure = await onLinkToTransaction(importedId, transactionId)
    setBusyId(null)
    setError(failure)
  }

  const save = async () => {
    setSaving(true)
    const failure = await onLinkToBudgets(chosen)
    setSaving(false)
    setError(failure)

    // Clear what went in, so a row that the write skipped keeps its choice and
    // everything else starts clean. Nothing here is keyed by anything but the
    // row id, so a reload that removes the row removes its entry's meaning.
    if (failure === null) {
      const saved = new Set(chosen.map((link) => link.importedId))
      const without = <T,>(current: Record<string, T>) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => !saved.has(id)),
        )
      setBudgetChoice(without)
      setNotes(without)
    }
  }

  if (unlinked.length === 0) {
    return (
      <Alert title="Nothing waiting" variant="light">
        Every imported transaction has been accounted for.
      </Alert>
    )
  }

  const busy = saving || busyId !== null

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
                  {/* One at a time, unlike budgeting below: accepting a
                      suggestion is a judgement about one specific pair, and
                      the remaining suggestions are recomputed from what the
                      link changed. Every other button is held while one is in
                      flight, so the list cannot re-order under a thumb
                      mid-tap. */}
                  <Button
                    size="compact-sm"
                    disabled={busy && busyId !== suggestion.imported.id}
                    loading={busyId === suggestion.imported.id}
                    onClick={() =>
                      void acceptSuggestion(
                        suggestion.imported.id,
                        suggestion.transaction.id,
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
              disabled={busy}
              onChange={(value) =>
                setBudgetChoice((current) => ({ ...current, [row.id]: value }))
              }
            />

            <TextInput
              placeholder="Note (optional)"
              value={notes[row.id] ?? ''}
              disabled={busy}
              onChange={(event) => {
                // Read the value out of the event before the updater: React
                // clears `currentTarget` once the handler returns, and a
                // functional updater does not necessarily run before then.
                const note = event.currentTarget.value
                setNotes((current) => ({ ...current, [row.id]: note }))
              }}
            />
          </Stack>
        </Card>
      ))}

      <Button
        onClick={() => void save()}
        disabled={chosen.length === 0 || busy}
        loading={saving}
      >
        Budget {chosen.length}{' '}
        {chosen.length === 1 ? 'transaction' : 'transactions'}
      </Button>
    </Stack>
  )
}
