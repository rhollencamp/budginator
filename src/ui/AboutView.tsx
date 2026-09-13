import { Anchor, Card, List, Stack, Text, Title } from '@mantine/core'
import { GIT_SHA, REPO_URL } from '../buildInfo'

export function AboutView() {
  return (
    <Stack gap="md">
      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={2} size="h4">
            Budginator
          </Title>
          <Text size="sm">
            Envelope budgeting. Each budget is topped up by the same amount
            every month and whatever you do not spend carries forward, so a
            quiet month pays for a heavy one rather than disappearing.
          </Text>
          <Text size="sm">
            Spending is entered by hand as it happens, and the bank's own record
            is imported afterwards and reconciled against it. One transaction
            can be split across several budgets.
          </Text>
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={3} size="h5">
            How the money is stored
          </Title>
          <Text size="sm">
            Every amount is held as a whole number of cents, in the database and
            in the app, and no calculation anywhere uses floating point. A
            ledger that drifts by a cent a month is one nobody trusts.
          </Text>
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Stack gap="sm">
          <Title order={3} size="h5">
            This build
          </Title>
          <List size="sm" spacing="xs">
            <List.Item>
              Commit{' '}
              <Text span ff="monospace">
                {GIT_SHA}
              </Text>
            </List.Item>
            <List.Item>
              <Anchor href={REPO_URL} target="_blank" rel="noreferrer">
                Source on GitHub
              </Anchor>
            </List.Item>
          </List>
        </Stack>
      </Card>
    </Stack>
  )
}
