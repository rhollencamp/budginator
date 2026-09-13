import { useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core'
import { today } from '../budget/dates'
import { formatAmountInput, parseAmount } from '../budget/money'
import type {
  AutoLinkExpression,
  BankAccount,
  Budget,
  ImportedTransaction,
  Transaction,
} from '../budget/types'
import { Amount } from './Amount'
import { AmountInput } from './AmountInput'
import { BudgetSelect } from './BudgetSelect'
import { DateInput } from './DateInput'

interface SetupViewProps {
  budgets: readonly Budget[]
  accounts: readonly BankAccount[]
  expressions: readonly AutoLinkExpression[]
  onSaveBudget: (input: {
    id: string | null
    name: string
    icon: string
    amountCents: number
    startDate: string
  }) => Promise<string | null>
  onDeleteBudget: (id: string) => Promise<string | null>
  onSaveAccount: (input: {
    id: string | null
    name: string
    multiplier: -1 | 1
  }) => Promise<string | null>
  onDeleteAccount: (id: string) => Promise<string | null>
  onSaveExpression: (input: {
    id: string | null
    expression: string
    budgetId: string
  }) => Promise<string | null>
  onDeleteExpression: (id: string) => Promise<string | null>
  imported: readonly ImportedTransaction[]
  transactions: readonly Transaction[]
  onSaveImported: (input: {
    id: string | null
    bankAccountId: string
    date: string
    merchant: string
    amountCents: number
  }) => Promise<string | null>
  onUnlinkImported: (id: string) => Promise<string | null>
  onDeleteImported: (id: string) => Promise<string | null>
  /** Which tab to open on, so a prompt elsewhere can land on the right one. */
  initialTab?: string
}

/**
 * Budgets, bank accounts, auto-link rules, and the imported rows themselves.
 *
 * The Django app kept all of this in its admin site, which meant the one part
 * of the app you had to use a desktop for was the part you needed before you
 * could use any of the rest. They are ordinary screens here.
 *
 * The Imported tab is the deliberate odd one out: it is not part of the daily
 * loop — that is Import, then Link — but the admin listed every imported row
 * and let you correct one, and without it the only fix for a row linked to the
 * wrong thing three weeks ago is deleting the transaction it points at.
 */
export function SetupView(props: SetupViewProps) {
  return (
    <Tabs defaultValue={props.initialTab ?? 'budgets'} keepMounted={false}>
      <Tabs.List grow mb="md">
        <Tabs.Tab value="budgets">Budgets</Tabs.Tab>
        <Tabs.Tab value="accounts">Accounts</Tabs.Tab>
        <Tabs.Tab value="rules">Rules</Tabs.Tab>
        <Tabs.Tab value="imported">Imported</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="budgets">
        <BudgetsTab {...props} />
      </Tabs.Panel>
      <Tabs.Panel value="accounts">
        <AccountsTab {...props} />
      </Tabs.Panel>
      <Tabs.Panel value="rules">
        <RulesTab {...props} />
      </Tabs.Panel>
      <Tabs.Panel value="imported">
        <ImportedTab {...props} />
      </Tabs.Panel>
    </Tabs>
  )
}

function BudgetsTab({ budgets, onSaveBudget, onDeleteBudget }: SetupViewProps) {
  const [editing, setEditing] = useState<Budget | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" variant="light" title="Could not save">
          {error}
        </Alert>
      )}

      <Button onClick={() => setEditing(null)}>New budget</Button>

      {budgets.map((budget) => (
        <Card key={budget.id} withBorder padding="sm">
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text fw={500}>
                {budget.icon} {budget.name}
              </Text>
              <Text size="sm" c="dimmed">
                {budget.amountCents === 0 ? (
                  'No monthly allowance'
                ) : (
                  <>
                    <Amount cents={budget.amountCents} /> a month from{' '}
                    {budget.startDate}
                  </>
                )}
              </Text>
            </Stack>

            <Group gap="xs" wrap="nowrap">
              <Button
                size="compact-sm"
                variant="subtle"
                onClick={() => setEditing(budget)}
              >
                Edit
              </Button>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={`Delete ${budget.name}`}
                onClick={async () => setError(await onDeleteBudget(budget.id))}
              >
                ×
              </ActionIcon>
            </Group>
          </Group>
        </Card>
      ))}

      {budgets.length > 0 && (
        <Text size="xs" c="dimmed">
          A budget that has spending against it cannot be deleted — move those
          transactions to another budget first, so the history stays intact.
        </Text>
      )}

      <BudgetForm
        budget={editing}
        onClose={() => setEditing(undefined)}
        onSave={onSaveBudget}
      />
    </Stack>
  )
}

/** `budget` is `undefined` when closed, `null` when creating. */
function BudgetForm({
  budget,
  onClose,
  onSave,
}: {
  budget: Budget | null | undefined
  onClose: () => void
  onSave: SetupViewProps['onSaveBudget']
}) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [amount, setAmount] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Re-seed the fields whenever a different budget is opened. Deriving state
  // from props this way is what Mantine's uncontrolled forms do internally;
  // the alternative is remounting on a key, which loses the modal's animation.
  const [seeded, setSeeded] = useState<string | null | undefined>(undefined)

  if (budget !== undefined && seeded !== (budget?.id ?? null)) {
    setSeeded(budget?.id ?? null)
    setName(budget?.name ?? '')
    setIcon(budget?.icon ?? '')
    setAmount(budget ? formatAmountInput(budget.amountCents) : '')
    setStartDate(budget?.startDate ?? firstOfThisMonth())
    setError(null)
  }

  const cents = amount.trim() === '' ? 0 : parseAmount(amount)
  const canSave = name.trim() !== '' && cents !== null && cents >= 0 && !busy

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (cents === null) return

    setBusy(true)
    const failure = await onSave({
      id: budget?.id ?? null,
      name: name.trim(),
      icon: icon.trim(),
      amountCents: cents,
      startDate,
    })
    setBusy(false)

    if (failure) setError(failure)
    else {
      setSeeded(undefined)
      onClose()
    }
  }

  return (
    <Modal
      opened={budget !== undefined}
      onClose={onClose}
      title={budget ? 'Edit budget' : 'New budget'}
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}

          <TextInput
            label="Name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
            data-autofocus
          />

          <TextInput
            label="Icon"
            description="One emoji, shown beside the name"
            value={icon}
            onChange={(event) => setIcon(event.currentTarget.value)}
            maxLength={4}
          />

          <AmountInput
            label="Monthly amount"
            description="Leave blank for a budget that only groups spending"
            value={amount}
            onChange={setAmount}
          />

          <DateInput
            label="Starts"
            description="The first month this budget is topped up"
            value={startDate}
            onChange={(event) => setStartDate(event.currentTarget.value)}
            required
          />

          <Button type="submit" disabled={!canSave} loading={busy}>
            Save
          </Button>
        </Stack>
      </form>
    </Modal>
  )
}

/** Budgets accrue by whole months, so a start date mid-month is misleading. */
function firstOfThisMonth(): string {
  return `${today().slice(0, 7)}-01`
}

function AccountsTab({
  accounts,
  onSaveAccount,
  onDeleteAccount,
}: SetupViewProps) {
  const [editing, setEditing] = useState<BankAccount | null | undefined>(
    undefined,
  )
  const [name, setName] = useState('')
  const [multiplier, setMultiplier] = useState<'-1' | '1'>('1')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const open = (account: BankAccount | null) => {
    setEditing(account)
    setName(account?.name ?? '')
    setMultiplier(account && account.multiplier === -1 ? '-1' : '1')
    setError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    setBusy(true)
    const failure = await onSaveAccount({
      id: editing?.id ?? null,
      name: name.trim(),
      multiplier: multiplier === '-1' ? -1 : 1,
    })
    setBusy(false)

    if (failure) setError(failure)
    else setEditing(undefined)
  }

  return (
    <Stack gap="md">
      {error && !editing && (
        <Alert color="red" variant="light" title="Could not save">
          {error}
        </Alert>
      )}

      <Button onClick={() => open(null)}>New account</Button>

      {accounts.map((account) => (
        <Card key={account.id} withBorder padding="sm">
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={2}>
              <Text fw={500}>{account.name}</Text>
              <Text size="sm" c="dimmed">
                {account.multiplier === -1
                  ? 'Statements write spending as a positive number'
                  : 'Statements write spending as a negative number'}
              </Text>
            </Stack>

            <Group gap="xs" wrap="nowrap">
              <Button
                size="compact-sm"
                variant="subtle"
                onClick={() => open(account)}
              >
                Edit
              </Button>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={`Delete ${account.name}`}
                onClick={async () =>
                  setError(await onDeleteAccount(account.id))
                }
              >
                ×
              </ActionIcon>
            </Group>
          </Group>
        </Card>
      ))}

      <Text size="xs" c="dimmed">
        Deleting an account deletes the transactions imported from it. Anything
        already budgeted stays; only the bank's own copy goes.
      </Text>

      <Modal
        opened={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? 'Edit account' : 'New account'}
      >
        <form onSubmit={submit}>
          <Stack gap="md">
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}

            <TextInput
              label="Name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              required
              data-autofocus
            />

            <div>
              <Text size="sm" fw={500} mb={4}>
                In this bank's exports, spending is…
              </Text>
              <SegmentedControl
                fullWidth
                value={multiplier}
                onChange={(value) => setMultiplier(value as '-1' | '1')}
                data={[
                  { value: '1', label: 'Negative (-12.34)' },
                  { value: '-1', label: 'Positive (12.34)' },
                ]}
              />
              <Text size="xs" c="dimmed" mt={4}>
                Open a statement and look at a purchase. This is the only
                setting that decides whether imports land the right way round.
              </Text>
            </div>

            <Button
              type="submit"
              disabled={name.trim() === '' || busy}
              loading={busy}
            >
              Save
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  )
}

function RulesTab({
  expressions,
  budgets,
  onSaveExpression,
  onDeleteExpression,
}: SetupViewProps) {
  // `undefined` when the form is closed, `null` when adding, the rule when
  // editing — the same three states the budget and account forms use.
  const [editing, setEditing] = useState<AutoLinkExpression | null | undefined>(
    undefined,
  )
  const [expression, setExpression] = useState('')
  const [budgetId, setBudgetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const budgetsById = new Map(budgets.map((budget) => [budget.id, budget]))
  const malformed = expression !== '' && !isValidRegExp(expression)

  const open = (rule: AutoLinkExpression | null) => {
    setEditing(rule)
    setExpression(rule?.expression ?? '')
    setBudgetId(rule?.budgetId ?? null)
    setError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!budgetId) return

    setBusy(true)
    const failure = await onSaveExpression({
      id: editing?.id ?? null,
      expression: expression.trim(),
      budgetId,
    })
    setBusy(false)

    if (failure) {
      setError(failure)
      return
    }

    setEditing(undefined)
  }

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" variant="light" title="Could not save">
          {error}
        </Alert>
      )}

      <Button onClick={() => open(null)} disabled={budgets.length === 0}>
        New rule
      </Button>

      {expressions.map((rule) => (
        <Card key={rule.id} withBorder padding="sm">
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text ff="monospace" lineClamp={1}>
                {rule.expression}
              </Text>
              <Text size="sm" c="dimmed">
                → {budgetsById.get(rule.budgetId)?.icon}{' '}
                {budgetsById.get(rule.budgetId)?.name ?? 'Unknown budget'}
              </Text>
            </Stack>

            <Group gap="xs" wrap="nowrap">
              <Button
                size="compact-sm"
                variant="subtle"
                onClick={() => open(rule)}
              >
                Edit
              </Button>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={`Delete rule ${rule.expression}`}
                onClick={async () =>
                  setError(await onDeleteExpression(rule.id))
                }
              >
                ×
              </ActionIcon>
            </Group>
          </Group>
        </Card>
      ))}

      <Text size="xs" c="dimmed">
        Rules are regular expressions matched against the merchant, ignoring
        case, anywhere in the text — so <code>COSTCO</code> catches
        <code> SQ *COSTCO #1234</code>. They are tried in order and the first
        match wins.
      </Text>

      <Modal
        opened={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? 'Edit rule' : 'New rule'}
      >
        <form onSubmit={submit}>
          <Stack gap="md">
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}

            <TextInput
              label="Pattern"
              placeholder="COSTCO"
              value={expression}
              onChange={(event) => setExpression(event.currentTarget.value)}
              error={malformed ? 'Not a valid regular expression' : undefined}
              required
              data-autofocus
            />

            <BudgetSelect
              budgets={budgets}
              value={budgetId}
              onChange={setBudgetId}
              required
            />

            <Button
              type="submit"
              disabled={
                expression.trim() === '' || malformed || !budgetId || busy
              }
              loading={busy}
            >
              Save
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  )
}

function isValidRegExp(source: string): boolean {
  try {
    new RegExp(source)
    return true
  } catch {
    return false
  }
}

/** How many rows the Imported tab draws before asking you to narrow the filter. */
const IMPORTED_PAGE = 100

/**
 * Every imported row, not just the unlinked ones.
 *
 * The daily loop does not come through here — that is Import, then Link — and
 * a row reaching this screen usually means something needs undoing: a statement
 * imported against the wrong account, a link made to the wrong transaction, a
 * merchant the reader garbled. The Django admin is what this replaces, so it
 * can do what the admin could: list, filter, correct, unlink and delete.
 *
 * Unlinking is the operation to reach for first. It says "these were not the
 * same event after all" and leaves the transaction, and the budget it was
 * charged to, exactly as they were.
 */
function ImportedTab({
  imported,
  transactions,
  accounts,
  budgets,
  onSaveImported,
  onUnlinkImported,
  onDeleteImported,
}: SetupViewProps) {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [status, setStatus] = useState<'all' | 'linked' | 'unlinked'>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<
    ImportedTransaction | null | undefined
  >(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const transactionsById = new Map(
    transactions.map((transaction) => [transaction.id, transaction]),
  )
  const budgetsById = new Map(budgets.map((budget) => [budget.id, budget]))
  const accountsById = new Map(accounts.map((account) => [account.id, account]))

  const query = search.trim().toLowerCase()
  const matching = imported.filter((row) => {
    if (accountId && row.bankAccountId !== accountId) return false
    if (status === 'linked' && row.transactionId === null) return false
    if (status === 'unlinked' && row.transactionId !== null) return false
    if (query !== '' && !row.merchant.toLowerCase().includes(query))
      return false
    return true
  })

  // Newest first, and only a page of them: an account with a decade of
  // statements is tens of thousands of rows, and drawing all of them to find
  // one is slower than typing three letters of the merchant into the search.
  const visible = [...matching]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, IMPORTED_PAGE)

  const act = async (id: string, action: () => Promise<string | null>) => {
    setBusyId(id)
    setError(await action())
    setBusyId(null)
  }

  /** What a linked row is linked to, described in one line. */
  const describeLink = (row: ImportedTransaction) => {
    const transaction = transactionsById.get(row.transactionId ?? '')
    if (!transaction) return null

    const names = transaction.splits
      .map((split) => budgetsById.get(split.budgetId))
      .map((budget) => (budget ? `${budget.icon} ${budget.name}` : 'Unknown'))

    return names.length > 0 ? names.join(', ') : 'No budget'
  }

  if (accounts.length === 0) {
    return (
      <Alert title="No bank accounts yet" variant="light">
        Imported transactions belong to an account. Add one first.
      </Alert>
    )
  }

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" variant="light" title="Could not do that">
          {error}
        </Alert>
      )}

      <Select
        label="Account"
        placeholder="All accounts"
        clearable
        value={accountId}
        onChange={setAccountId}
        data={accounts.map((account) => ({
          value: account.id,
          label: account.name,
        }))}
      />

      <SegmentedControl
        fullWidth
        value={status}
        onChange={(value) => setStatus(value as typeof status)}
        data={[
          { value: 'all', label: 'All' },
          { value: 'unlinked', label: 'Unlinked' },
          { value: 'linked', label: 'Linked' },
        ]}
      />

      <TextInput
        label="Search"
        placeholder="Merchant"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {matching.length > visible.length
            ? `Showing ${visible.length} of ${matching.length} — narrow the filter to see the rest`
            : `${matching.length} ${matching.length === 1 ? 'row' : 'rows'}`}
        </Text>
        <Button
          size="compact-sm"
          variant="light"
          onClick={() => setEditing(null)}
        >
          Add by hand
        </Button>
      </Group>

      {visible.map((row) => {
        const linkedTo = describeLink(row)

        return (
          <Card key={row.id} withBorder padding="sm">
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text fw={500} lineClamp={2}>
                    {row.merchant || '(no merchant)'}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {row.date} ·{' '}
                    {accountsById.get(row.bankAccountId)?.name ??
                      'Unknown account'}
                  </Text>
                </Stack>
                <Amount cents={row.amountCents} fw={600} />
              </Group>

              <Group gap="xs">
                {row.transactionId === null ? (
                  <Badge variant="default" radius="sm">
                    Unlinked
                  </Badge>
                ) : (
                  <Badge variant="light" radius="sm">
                    {linkedTo ?? 'Linked'}
                  </Badge>
                )}
              </Group>

              <Group gap="xs">
                <Button
                  size="compact-sm"
                  variant="subtle"
                  onClick={() => setEditing(row)}
                >
                  Edit
                </Button>

                {/* Leaves the transaction alone: this says the two were not
                    the same event, not that the spending did not happen. */}
                {row.transactionId !== null && (
                  <Button
                    size="compact-sm"
                    variant="subtle"
                    loading={busyId === row.id}
                    onClick={() => act(row.id, () => onUnlinkImported(row.id))}
                  >
                    Unlink
                  </Button>
                )}

                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="red"
                  loading={busyId === row.id}
                  onClick={() => act(row.id, () => onDeleteImported(row.id))}
                >
                  Delete
                </Button>
              </Group>
            </Stack>
          </Card>
        )
      })}

      <Text size="xs" c="dimmed">
        Deleting a row removes the bank&apos;s copy only. If it was linked, the
        transaction it pointed at stays — and the import will offer the row
        again next time that statement is read.
      </Text>

      <ImportedForm
        row={editing}
        accounts={accounts}
        onClose={() => setEditing(undefined)}
        onSave={onSaveImported}
      />
    </Stack>
  )
}

/** `row` is `undefined` when closed, `null` when adding one by hand. */
function ImportedForm({
  row,
  accounts,
  onClose,
  onSave,
}: {
  row: ImportedTransaction | null | undefined
  accounts: readonly BankAccount[]
  onClose: () => void
  onSave: SetupViewProps['onSaveImported']
}) {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [date, setDate] = useState(today())
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [seeded, setSeeded] = useState<string | null | undefined>(undefined)

  if (row !== undefined && seeded !== (row?.id ?? null)) {
    setSeeded(row?.id ?? null)
    setAccountId(row?.bankAccountId ?? accounts[0]?.id ?? null)
    setDate(row?.date ?? today())
    setMerchant(row?.merchant ?? '')
    setAmount(row ? formatAmountInput(row.amountCents) : '')
    setError(null)
  }

  const cents = parseAmount(amount)
  const canSave = cents !== null && accountId !== null && !busy

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (cents === null || accountId === null) return

    setBusy(true)
    const failure = await onSave({
      id: row?.id ?? null,
      bankAccountId: accountId,
      date,
      merchant,
      amountCents: cents,
    })
    setBusy(false)

    if (failure) setError(failure)
    else {
      setSeeded(undefined)
      onClose()
    }
  }

  return (
    <Modal
      opened={row !== undefined}
      onClose={onClose}
      title={row ? 'Edit imported transaction' : 'Add imported transaction'}
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}

          {row?.transactionId && (
            <Alert color="yellow" variant="light">
              This row is linked to a transaction. Changing its date or amount
              will make the two disagree — unlink it first if they are not the
              same purchase.
            </Alert>
          )}

          <Select
            label="Account"
            value={accountId}
            onChange={setAccountId}
            data={accounts.map((account) => ({
              value: account.id,
              label: account.name,
            }))}
            required
          />

          <AmountInput
            label="Amount"
            description="Negative for spending, as the app stores it"
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

          <Button type="submit" disabled={!canSave} loading={busy}>
            Save
          </Button>
        </Stack>
      </form>
    </Modal>
  )
}
