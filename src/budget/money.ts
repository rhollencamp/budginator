/**
 * Money is integer cents everywhere in this app — in the database, in this
 * module's types, and in every calculation. Nothing here produces a `number`
 * with a fractional part, and nothing parses through `parseFloat`: a budget
 * that drifts by a cent a month is a budget nobody trusts.
 *
 * Strings cross the boundary in two places only — what the user types, and
 * what a bank puts in a CSV column — and both come through `parseAmount`.
 */

/** Cents in one dollar. Every conversion in this module goes through it. */
const CENTS_PER_UNIT = 100

/**
 * Reads a human- or bank-written amount as integer cents, or `null` if it
 * cannot be read as one. Accepts a leading currency symbol, thousands commas,
 * a leading `+`, and both ways of writing a negative: `-12.34` and `(12.34)`.
 *
 * A missing fractional part means zero cents, and a one-digit one is tenths —
 * `1.5` is 150 cents, not 105. More than two fractional digits is rejected
 * rather than rounded: a sub-cent amount is a sign the column was misread, and
 * silently absorbing it is how rounding error gets into a ledger.
 */
export function parseAmount(input: string): number | null {
  let text = input.replace(/[$\s,]/g, '')
  if (text === '') return null

  let sign = 1
  if (text.startsWith('+')) {
    text = text.slice(1)
  } else if (text.startsWith('-')) {
    sign = -1
    text = text.slice(1)
  } else if (text.startsWith('(') && text.endsWith(')')) {
    sign = -1
    text = text.slice(1, -1)
  }

  const match = /^(\d*)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) return null

  const [, whole, fraction] = match
  // `.50` is legal, `.` alone is not: one side or the other has to have digits.
  if (whole === '' && fraction === undefined) return null

  const wholeCents = (whole === '' ? 0 : Number(whole)) * CENTS_PER_UNIT
  const fractionCents =
    fraction === undefined ? 0 : Number(fraction.padEnd(2, '0'))

  return sign * (wholeCents + fractionCents)
}

/**
 * Renders cents as a currency string: `-123456` becomes `-$1,234.56`. The sign
 * leads the symbol rather than wrapping the figure in parentheses, because the
 * amount that needs reading at a glance here is the one with a minus on it.
 */
export function formatAmount(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  const whole = Math.trunc(absolute / CENTS_PER_UNIT)
  const fraction = absolute % CENTS_PER_UNIT

  return `${sign}$${whole.toLocaleString('en-US')}.${String(fraction).padStart(2, '0')}`
}

/**
 * The same figure without a currency symbol or grouping, which is what an
 * editable text input wants: round-trips through `parseAmount` unchanged.
 */
export function formatAmountInput(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)

  return `${sign}${Math.trunc(absolute / CENTS_PER_UNIT)}.${String(
    absolute % CENTS_PER_UNIT,
  ).padStart(2, '0')}`
}

/** Sums cents without ever leaving integers. */
export function sumCents(amounts: readonly number[]): number {
  let total = 0
  for (const amount of amounts) total += amount
  return total
}
