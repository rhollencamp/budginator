import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  List,
  Stack,
  Text,
} from '@mantine/core'
import { suggestAutoLinks } from '../budget/autoLink'
import type {
  AutoLinkExpression,
  Budget,
  ImportedTransaction,
} from '../budget/types'
import { Amount } from './Amount'

interface AutoLinkViewProps {
  imported: readonly ImportedTransaction[]
  expressions: readonly AutoLinkExpression[]
  budgets: readonly Budget[]
  onApply: (
    links: { importedId: string; budgetId: string; note: string }[],
  ) => Promise<string | null>
  onEditRules: () => void
}

/**
 * Applies the merchant rules to the unlinked queue in bulk.
 *
 * Every proposal is shown with the rule that produced it and is ticked by
 * default — the point of the screen is to clear thirty rows in one press — but
 * nothing is applied until the button is pressed, and a wrong proposal is
 * unticked rather than undone afterwards.
 */
export function AutoLinkView({
  imported,
  expressions,
  budgets,
  onApply,
  onEditRules,
}: AutoLinkViewProps) {
  const { suggestions, invalid } = useMemo(
    () => suggestAutoLinks(imported, expressions),
    [imported, expressions],
  )

  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const budgetsById = useMemo(
    () => new Map(budgets.map((budget) => [budget.id, budget])),
    [budgets],
  )

  const chosen = suggestions.filter(
    (suggestion) => !excluded.has(suggestion.imported.id),
  )

  const toggle = (id: string) => {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const apply = async () => {
    setBusy(true)
    const failure = await onApply(
      chosen.map((suggestion) => ({
        importedId: suggestion.imported.id,
        budgetId: suggestion.budgetId,
        // The rule that matched, recorded on the split, so a budget's history
        // says why a transaction landed where it did.
        note: `auto: ${suggestion.expression}`,
      })),
    )
    setBusy(false)

    if (failure) setError(failure)
    else setExcluded(new Set())
  }

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" title="Could not apply" variant="light">
          {error}
        </Alert>
      )}

      {invalid.length > 0 && (
        <Alert
          color="yellow"
          variant="light"
          title="Rules that could not be read"
        >
          <List size="sm" spacing="xs">
            {invalid.map((entry) => (
              <List.Item key={entry.expression.id}>
                <code>{entry.expression.expression}</code> — {entry.message}
              </List.Item>
            ))}
          </List>
          <Button
            size="compact-xs"
            variant="subtle"
            mt="xs"
            onClick={onEditRules}
          >
            Edit the rules
          </Button>
        </Alert>
      )}

      {expressions.length === 0 && (
        <Alert title="No rules yet" variant="light">
          <Stack align="flex-start" gap="sm">
            <Text size="sm">
              A rule is a pattern matched against the merchant — anything
              matching it is proposed for the budget you attach it to, so a
              month of supermarket rows clears in one press.
            </Text>
            <Button onClick={onEditRules}>Add a rule</Button>
          </Stack>
        </Alert>
      )}

      {expressions.length > 0 && suggestions.length === 0 && (
        <Alert title="Nothing matched" variant="light">
          None of the waiting transactions matches a rule.
        </Alert>
      )}

      {suggestions.map((suggestion) => {
        const budget = budgetsById.get(suggestion.budgetId)

        return (
          <Card key={suggestion.imported.id} withBorder padding="sm">
            <Group wrap="nowrap" align="flex-start">
              <Checkbox
                checked={!excluded.has(suggestion.imported.id)}
                onChange={() => toggle(suggestion.imported.id)}
                aria-label={`Budget ${suggestion.imported.merchant} as ${budget?.name ?? 'unknown'}`}
                mt={4}
              />

              <Stack gap={2} flex={1} style={{ minWidth: 0 }}>
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={500} lineClamp={1}>
                    {suggestion.imported.merchant || '(no merchant)'}
                  </Text>
                  <Amount cents={suggestion.imported.amountCents} />
                </Group>
                <Text size="sm" c="dimmed">
                  {suggestion.imported.date} → {budget?.icon} {budget?.name}
                </Text>
                <Text size="xs" c="dimmed">
                  matched <code>{suggestion.expression}</code>
                </Text>
              </Stack>
            </Group>
          </Card>
        )
      })}

      {suggestions.length > 0 && (
        <Button
          onClick={apply}
          disabled={chosen.length === 0 || busy}
          loading={busy}
        >
          Budget {chosen.length}{' '}
          {chosen.length === 1 ? 'transaction' : 'transactions'}
        </Button>
      )}
    </Stack>
  )
}
