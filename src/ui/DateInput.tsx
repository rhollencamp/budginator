import { TextInput, type TextInputProps } from '@mantine/core'

/**
 * A calendar date.
 *
 * `type="date"` rather than a component from `@mantine/dates`: the native
 * control is the one a phone already knows how to show, it needs no date
 * library in the bundle, and its value is a `YYYY-MM-DD` string — which is
 * exactly what the domain holds (see `src/budget/dates.ts`), so the value goes
 * from the input to the database without ever being a `Date` that a timezone
 * could shift by a day.
 */
export function DateInput(props: TextInputProps) {
  return <TextInput type="date" {...props} />
}
