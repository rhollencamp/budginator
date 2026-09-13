import { TextInput, type TextInputProps } from '@mantine/core'
import { parseAmount } from '../budget/money'

interface AmountInputProps extends Omit<TextInputProps, 'value' | 'onChange'> {
  /** The raw text as typed, not cents: the field holds what the user wrote. */
  value: string
  onChange: (value: string) => void
}

/**
 * A money field.
 *
 * It is a text input rather than Mantine's `NumberInput`, and it holds a string
 * rather than a number, for the same reason the rest of the app holds cents: a
 * numeric input gives back a float, and `12.30` arriving as
 * `12.299999999999999` is the class of bug this app exists to avoid. The text
 * goes through `parseAmount` when the form is submitted, and that is the only
 * place a value becomes a number.
 *
 * `inputMode="decimal"` gets the numeric keypad on a phone without the spinner
 * arrows and scroll-wheel edits of `type="number"`.
 */
export function AmountInput({
  value,
  onChange,
  error,
  ...props
}: AmountInputProps) {
  const unreadable = value.trim() !== '' && parseAmount(value) === null

  return (
    <TextInput
      {...props}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      inputMode="decimal"
      autoComplete="off"
      // A value that cannot be read at all outranks whatever the form wanted
      // to say about it.
      error={unreadable ? 'Not an amount' : error}
    />
  )
}
