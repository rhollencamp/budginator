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
 *
 * It inherits its type rather than carrying Mantine's default body size: an
 * amount is nearly always set inside other text — a badge, a dimmed caption,
 * an alert — and a figure two sizes larger than the words around it reads as a
 * mistake. Where it stands on its own the surrounding font is the body font
 * anyway, so inheriting changes nothing there. A figure that does want a size
 * of its own has to turn it off: `<Amount size="xl" inherit={false} />`.
 */
export function Amount({ cents, colored = false, ...props }: AmountProps) {
  return (
    <Text
      component="span"
      className="amount"
      inherit
      c={colored ? amountColor(cents) : undefined}
      fw={colored ? 600 : undefined}
      {...props}
    >
      {formatAmount(cents)}
    </Text>
  )
}
