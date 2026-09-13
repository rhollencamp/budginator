import { useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Group,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { formatAmountInput, parseAmount } from '../budget/money'
import { splitRemainder } from '../budget/transactions'
import type { Budget, ImportedTransaction, Transaction } from '../budget/types'
import { Amount } from './Amount'
import { AmountInput } from './AmountInput'
import { BudgetSelect } from './BudgetSelect'
import { DateInput } from './DateInput'

interface EditTransactionViewProps {
  transaction: Transaction
  budgets: readonly Budget[]
  /** The bank row this came from, if any. */
  linkedImport?: ImportedTransaction
  onSave: (input: {
    id: string
    date: string
    merchant: string
    amountCents: number
    splits: { budgetId: string; amountCents: number; note: string }[]
  }) => Promise<string | null>
  onDelete: (id: string) => Promise<string | null>
  onDone: () => void
}

/** A split as the form holds it: amounts are the text typed, not cents yet. */
interface DraftRow {
  key: number
  budgetId: string | null
  amount: string
  note: string
}

export function EditTransactionView({
  transaction,
  budgets,
  linkedImport,
  onSave,
  onDelete,
  onDone,
}: EditTransactionViewProps) {
  const [date, setDate] = useState(transaction.date)
  const [merchant, setMerchant] = useState(transaction.merchant)
  const [amount, setAmount] = useState(
    formatAmountInput(transaction.amountCents),
  )
  const [rows, setRows] = useState<DraftRow[]>(() =>
    transaction.splits.map((split, index) => ({
      key: index,
      budgetId: split.budgetId,
      amount: formatAmountInput(split.amountCents),
      note: split.note,
    })),
  )
  const [nextKey, setNextKey] = useState(transaction.splits.length)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const totalCents = parseAmount(amount)

  // A row with an unreadable amount counts as zero here so the remainder keeps
  // updating as it is typed; the save button is what refuses to proceed.
  const rowCents = rows.map((row) => parseAmount(row.amount) ?? 0)
  const remainder =
    totalCents === null
      ? null
      : splitRemainder(
          totalCents,
          rowCents.map((cents) => ({ amountCents: cents })),
        )

  const complete =
    totalCents !== null &&
    rows.length > 0 &&
    rows.every(
      (row, index) =>
        row.budgetId !== null &&
        parseAmount(row.amount) !== null &&
        rowCents[index] !== 0,
    )
  const balanced = remainder === 0
  const canSave = complete && balanced && !busy

  const update = (key: number, patch: Partial<DraftRow>) => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    )
  }

  const addRow = () => {
    // A new row is pre-filled with whatever is still unaccounted for, which is
    // the amount it almost always wants to be — splitting a receipt means
    // peeling an amount off the total, not typing two numbers that happen to
    // add up.
    setRows((current) => [
      ...current,
      {
        key: nextKey,
        budgetId: null,
        amount: remainder ? formatAmountInput(remainder) : '',
        note: '',
      },
    ])
    setNextKey((key) => key + 1)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (totalCents === null) return

    setBusy(true)
    const failure = await onSave({
      id: transaction.id,
      date,
      merchant,
      amountCents: totalCents,
      splits: rows.map((row, index) => ({
        // `complete` has already established these are set; the assertion is
        // for the type checker, not a claim the form makes on its own.
        budgetId: row.budgetId as string,
        amountCents: rowCents[index],
        note: row.note,
      })),
    })
    setBusy(false)

    if (failure) setError(failure)
    else onDone()
  }

  const remove = async () => {
    setBusy(true)
    const failure = await onDelete(transaction.id)
    setBusy(false)

    if (failure) setError(failure)
    else onDone()
  }

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        {error && (
          <Alert color="red" title="Could not save" variant="light">
            {error}
          </Alert>
        )}

        {linkedImport && (
          <Alert variant="light" title="Linked to a bank transaction">
            <Text size="sm">
              The bank recorded <Amount cents={linkedImport.amountCents} /> on{' '}
              {linkedImport.date}
              {linkedImport.merchant && ` at ${linkedImport.merchant}`}.
              Changing the total or the date here will make the two disagree —
              split it across budgets instead.
            </Text>
          </Alert>
        )}

        <Card withBorder padding="md">
          <Stack gap="md">
            <AmountInput
              label="Total"
              description="Negative for spending, positive for money in"
              value={amount}
              onChange={setAmount}
              required
            />

            <TextInput
              label="Merchant"
              value={merchant}
              onChange={(event) => setMerchant(event.currentTarget.value)}
            />

            <DateInput
              label="Date"
              value={date}
              onChange={(event) => setDate(event.currentTarget.value)}
              required
            />
          </Stack>
        </Card>

        <Group justify="space-between" align="center">
          <Text fw={600}>Split across budgets</Text>
          <Button variant="light" size="xs" onClick={addRow} type="button">
            Add split
          </Button>
        </Group>

        {rows.map((row) => (
          <Card key={row.key} withBorder padding="sm">
            <Stack gap="sm">
              <Group justify="space-between" wrap="nowrap" align="flex-end">
                <BudgetSelect
                  budgets={budgets}
                  value={row.budgetId}
                  onChange={(value) => update(row.key, { budgetId: value })}
                  flex={1}
                  required
                />
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="lg"
                  aria-label="Remove this split"
                  onClick={() =>
                    setRows((current) =>
                      current.filter((entry) => entry.key !== row.key),
                    )
                  }
                >
                  ×
                </ActionIcon>
              </Group>

              <AmountInput
                label="Amount"
                value={row.amount}
                onChange={(value) => update(row.key, { amount: value })}
                required
              />

              <TextInput
                label="Note"
                placeholder="Optional"
                value={row.note}
                onChange={(event) =>
                  update(row.key, { note: event.currentTarget.value })
                }
              />
            </Stack>
          </Card>
        ))}

        {/* The splits have to account for the transaction exactly, or the
            budgets stop adding up to the money that left the account. The
            remainder is in cents, so there is no tolerance and no rounding:
            either it is zero or the save is refused. */}
        {remainder !== null && remainder !== 0 && (
          <Alert color="yellow" variant="light" title="Splits do not add up">
            <Group gap="xs">
              <Text size="sm">
                <Amount cents={remainder} /> is still unaccounted for.
              </Text>
              {rows.length > 0 && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  type="button"
                  onClick={() => {
                    const last = rows[rows.length - 1]
                    update(last.key, {
                      amount: formatAmountInput(
                        (parseAmount(last.amount) ?? 0) + remainder,
                      ),
                    })
                  }}
                >
                  Add it to the last split
                </Button>
              )}
            </Group>
          </Alert>
        )}

        <Button type="submit" disabled={!canSave} loading={busy}>
          Save
        </Button>

        <Button variant="subtle" onClick={onDone} type="button">
          Cancel
        </Button>

        <Button
          variant="subtle"
          color="red"
          onClick={remove}
          type="button"
          disabled={busy}
        >
          Delete transaction
        </Button>
      </Stack>
    </form>
  )
}
