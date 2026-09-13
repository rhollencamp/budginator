import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  SegmentedControl,
  Stack,
  TextInput,
} from '@mantine/core'
import { today } from '../budget/dates'
import { parseAmount } from '../budget/money'
import type { Budget } from '../budget/types'
import { AmountInput } from './AmountInput'
import { BudgetSelect } from './BudgetSelect'
import { DateInput } from './DateInput'

interface TrackViewProps {
  budgets: readonly Budget[]
  /** The budget the user arrived with, from the dashboard; may be absent. */
  initialBudgetId?: string
  onSave: (input: {
    date: string
    merchant: string
    amountCents: number
    budgetId: string
    note: string
  }) => Promise<string | null>
  onSaved: (budgetId: string) => void
}

/**
 * Quick entry: the screen used standing in a shop, so it is one budget, one
 * amount, and done. Anything more complicated — a receipt across two budgets —
 * is entered here and then split in the editor.
 *
 * The amount is typed unsigned and the direction chosen with a control, rather
 * than expecting a minus sign to be typed on a phone keypad. Spending is the
 * default because it is almost always what is being entered.
 */
export function TrackView({
  budgets,
  initialBudgetId,
  onSave,
  onSaved,
}: TrackViewProps) {
  const [date, setDate] = useState(today())
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<'spent' | 'received'>('spent')
  const [budgetId, setBudgetId] = useState<string | null>(
    initialBudgetId ?? null,
  )
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const cents = parseAmount(amount)
  const canSave = cents !== null && cents !== 0 && budgetId !== null && !saving

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (cents === null || budgetId === null) return

    setSaving(true)
    // The control decides the sign, so a typed minus cannot flip a "spent"
    // entry into income by accident.
    const signed = direction === 'spent' ? -Math.abs(cents) : Math.abs(cents)
    const failure = await onSave({
      date,
      merchant,
      amountCents: signed,
      budgetId,
      note,
    })
    setSaving(false)

    if (failure) {
      setError(failure)
      return
    }

    onSaved(budgetId)
  }

  if (budgets.length === 0) {
    return (
      <Alert title="No budgets yet" variant="light">
        Create a budget under Setup before tracking spending against one.
      </Alert>
    )
  }

  return (
    <form onSubmit={submit}>
      <Card withBorder padding="md">
        <Stack gap="md">
          {error && (
            <Alert color="red" title="Could not save" variant="light">
              {error}
            </Alert>
          )}

          <SegmentedControl
            value={direction}
            onChange={(value) => setDirection(value as 'spent' | 'received')}
            fullWidth
            data={[
              { value: 'spent', label: 'Spent' },
              { value: 'received', label: 'Received' },
            ]}
          />

          <AmountInput
            label="Amount"
            placeholder="0.00"
            value={amount}
            onChange={setAmount}
            required
            data-autofocus
          />

          <BudgetSelect
            budgets={budgets}
            value={budgetId}
            onChange={setBudgetId}
            required
          />

          <TextInput
            label="Merchant"
            placeholder="Where the money went"
            value={merchant}
            onChange={(event) => setMerchant(event.currentTarget.value)}
          />

          <DateInput
            label="Date"
            value={date}
            onChange={(event) => setDate(event.currentTarget.value)}
            required
          />

          <TextInput
            label="Note"
            placeholder="Optional"
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />

          <Button type="submit" disabled={!canSave} loading={saving}>
            Save
          </Button>
        </Stack>
      </Card>
    </form>
  )
}
