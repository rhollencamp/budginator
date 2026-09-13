import {
  Accordion,
  Alert,
  Badge,
  Button,
  Group,
  Stack,
  Table,
  Text,
} from '@mantine/core'
import { summarizeBudgets } from '../budget/budgets'
import { monthName, today } from '../budget/dates'
import { datedSplits } from '../budget/transactions'
import type { Budget, Transaction } from '../budget/types'
import { amountColor } from '../theme'
import { Amount } from './Amount'

interface DashboardViewProps {
  budgets: readonly Budget[]
  transactions: readonly Transaction[]
  onViewTransactions: (budgetId: string) => void
  onTrack: (budgetId: string) => void
  onSetUpBudgets: () => void
}

/**
 * The home screen: every envelope, what is left in it, and the month-by-month
 * history behind that figure.
 *
 * The balance on the badge is the carried-forward one — allowance since the
 * budget started, less everything charged to it — because that is the number
 * that answers "can I buy this". The months below show how it got there.
 */
export function DashboardView({
  budgets,
  transactions,
  onViewTransactions,
  onTrack,
  onSetUpBudgets,
}: DashboardViewProps) {
  const summaries = summarizeBudgets(
    budgets,
    datedSplits(transactions),
    today(),
  )

  if (budgets.length === 0) {
    return (
      <Alert title="No budgets yet" variant="light">
        <Stack align="flex-start" gap="sm">
          <Text size="sm">
            A budget is an envelope: it gets topped up by the same amount each
            month, and whatever you do not spend carries over.
          </Text>
          <Button onClick={onSetUpBudgets}>Create a budget</Button>
        </Stack>
      </Alert>
    )
  }

  return (
    <Accordion variant="separated" chevronPosition="right">
      {summaries.map((summary) => (
        <Accordion.Item key={summary.budget.id} value={summary.budget.id}>
          <Accordion.Control>
            <Group justify="space-between" wrap="nowrap" pr="xs">
              <Text fw={500} lineClamp={1}>
                {summary.budget.icon} {summary.budget.name}
              </Text>

              {/* A budget with no monthly allowance has no balance to run
                  down — it is a label for grouping spending — so it shows what
                  has gone through it rather than a misleading "available". */}
              <Badge
                color={amountColor(summary.availableCents)}
                radius="sm"
                size="lg"
              >
                <Amount
                  cents={
                    summary.budget.amountCents === 0
                      ? summary.spentCents
                      : summary.availableCents
                  }
                />
              </Badge>
            </Group>
          </Accordion.Control>

          <Accordion.Panel>
            <Stack gap="sm">
              <Group gap="xs">
                <Button
                  variant="light"
                  size="xs"
                  onClick={() => onTrack(summary.budget.id)}
                >
                  Track
                </Button>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => onViewTransactions(summary.budget.id)}
                >
                  Transactions
                </Button>
              </Group>

              {summary.budget.amountCents > 0 && (
                <Text size="sm" c="dimmed">
                  <Amount cents={summary.budget.amountCents} /> a month since{' '}
                  {summary.budget.startDate}
                </Text>
              )}

              <Table
                className="table-scroll"
                striped
                withRowBorders={false}
                aria-label={`${summary.budget.name} by month`}
              >
                <Table.Tbody>
                  {summary.months.map((month) => (
                    <Table.Tr key={`${month.year}-${month.month}`}>
                      <Table.Td>
                        {monthName(month.month)} {month.year}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Amount cents={month.spentCents} />
                      </Table.Td>
                      {/* What the month itself came to, allowance less spend,
                          ignoring the carry-over. A run of small negatives is
                          what an envelope slowly draining looks like. */}
                      <Table.Td ta="right">
                        <Amount cents={month.netCents} colored />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  )
}
