import { Text, type TextProps } from '@mantine/core'
import { formatAmount } from '../budget/money'
import { amountColor } from '../theme'

interface AmountProps extends TextProps {
  cents: number
  /**
   * Colour the figure by its sign. Off by default: in a list of spending every
   * line is negative, and colouring all of them red means none of them stands
   * out. Turn it on for a balance, where the sign is the point.
   */
  colored?: boolean
}

/**
 * A money figure. Always goes through `formatAmount`, and always carries the
 * `.amount` class, which sets the tabular figures that keep decimal points
 * lined up down a column.
 */
export function Amount({ cents, colored = false, ...props }: AmountProps) {
  return (
    <Text
      component="span"
      className="amount"
      c={colored ? amountColor(cents) : undefined}
      fw={colored ? 600 : undefined}
      {...props}
    >
      {formatAmount(cents)}
    </Text>
  )
}
