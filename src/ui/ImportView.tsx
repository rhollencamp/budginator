import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  FileInput,
  List,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core'
import { parseBankCsv, type CsvRowError } from '../budget/csv'
import { planImport, type ImportPlan } from '../budget/importer'
import type { BankAccount } from '../budget/types'
import { Amount } from './Amount'

interface ImportViewProps {
  accounts: readonly BankAccount[]
  /** Reads back what is already imported for the account, for the dedup check. */
  onLoadExisting: (
    accountId: string,
  ) => Promise<{ date: string; amountCents: number }[]>
  onImport: (
    accountId: string,
    rows: ImportPlan['toInsert'],
  ) => Promise<string | null>
  onSetUpAccounts: () => void
  onDone: () => void
}

interface Preview {
  accountId: string
  plan: ImportPlan
  errors: CsvRowError[]
}

/**
 * Importing a bank CSV, in two steps: read the file and say what would happen,
 * then do it.
 *
 * The preview is not politeness. Bank exports overlap, so most of a file is
 * usually already recorded, and an import that silently wrote everything would
 * double every transaction in the overlap — the previous version's most
 * damaging failure mode. Nothing is written until the summary has been seen.
 */
export function ImportView({
  accounts,
  onLoadExisting,
  onImport,
  onSetUpAccounts,
  onDone,
}: ImportViewProps) {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [imported, setImported] = useState<number | null>(null)

  const account = accounts.find((entry) => entry.id === accountId)

  const read = async () => {
    if (!file || !account) return

    setBusy(true)
    setError(null)
    setImported(null)

    try {
      const text = await file.text()
      const { rows, errors } = parseBankCsv(text, account.multiplier)
      const existing = await onLoadExisting(account.id)

      setPreview({
        accountId: account.id,
        plan: planImport(rows, existing),
        errors,
      })
    } catch (caught) {
      setPreview(null)
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!preview) return

    setBusy(true)
    const failure = await onImport(preview.accountId, preview.plan.toInsert)
    setBusy(false)

    if (failure) {
      setError(failure)
      return
    }

    setImported(preview.plan.toInsert.length)
    setPreview(null)
    setFile(null)
  }

  if (accounts.length === 0) {
    return (
      <Alert title="No bank accounts yet" variant="light">
        <Stack align="flex-start" gap="sm">
          <Text size="sm">
            An account records which way its statements write their numbers, so
            a debit ends up negative whichever convention the bank uses.
          </Text>
          <Button onClick={onSetUpAccounts}>Add an account</Button>
        </Stack>
      </Alert>
    )
  }

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" title="Could not read the file" variant="light">
          {error}
        </Alert>
      )}

      {imported !== null && (
        <Alert color="green" title="Imported" variant="light">
          <Stack align="flex-start" gap="sm">
            <Text size="sm">
              {imported} {imported === 1 ? 'transaction' : 'transactions'} added
              to the unlinked queue.
            </Text>
            <Button size="xs" onClick={onDone}>
              Link them now
            </Button>
          </Stack>
        </Alert>
      )}

      <Card withBorder padding="md">
        <Stack gap="md">
          <Select
            label="Account"
            placeholder="Which account is this from?"
            value={accountId}
            onChange={(value) => {
              setAccountId(value)
              setPreview(null)
            }}
            data={accounts.map((entry) => ({
              value: entry.id,
              label: entry.name,
            }))}
          />

          <FileInput
            label="Statement"
            description="A CSV export from the bank"
            placeholder="Choose a file"
            accept=".csv,text/csv"
            value={file}
            onChange={(chosen) => {
              setFile(chosen)
              setPreview(null)
            }}
          />

          <Button
            onClick={read}
            disabled={!file || !account || busy}
            loading={busy && !preview}
          >
            Read the file
          </Button>
        </Stack>
      </Card>

      {preview && (
        <Card withBorder padding="md">
          <Stack gap="md">
            <Text fw={600}>What this would do</Text>

            <Table withRowBorders={false}>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>New transactions</Table.Td>
                  <Table.Td ta="right" fw={600}>
                    {preview.plan.toInsert.length}
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Already imported</Table.Td>
                  <Table.Td ta="right">{preview.plan.duplicateCount}</Table.Td>
                </Table.Tr>
                {preview.errors.length > 0 && (
                  <Table.Tr>
                    <Table.Td>Unreadable rows</Table.Td>
                    <Table.Td ta="right">{preview.errors.length}</Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>

            {preview.plan.conflicts.length > 0 && (
              <Alert color="yellow" variant="light" title="Worth a look">
                <List size="sm" spacing="xs">
                  {preview.plan.conflicts.map((conflict) => (
                    <List.Item key={`${conflict.date}-${conflict.amountCents}`}>
                      {conflict.message}
                    </List.Item>
                  ))}
                </List>
              </Alert>
            )}

            {preview.errors.length > 0 && (
              <Alert
                color="red"
                variant="light"
                title="Rows that could not be read"
              >
                <Text size="sm" mb="xs">
                  These are not imported. Nothing else in the file is affected.
                </Text>
                <List size="sm" spacing="xs">
                  {preview.errors.slice(0, 10).map((rowError) => (
                    <List.Item key={rowError.line}>
                      Line {rowError.line}: {rowError.message}
                    </List.Item>
                  ))}
                  {preview.errors.length > 10 && (
                    <List.Item>
                      …and {preview.errors.length - 10} more.
                    </List.Item>
                  )}
                </List>
              </Alert>
            )}

            {preview.plan.toInsert.length > 0 && (
              <div className="table-scroll">
                <Table striped aria-label="Transactions to import">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Date</Table.Th>
                      <Table.Th>Merchant</Table.Th>
                      <Table.Th ta="right">Amount</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {preview.plan.toInsert.map((row, index) => (
                      <Table.Tr key={`${row.date}-${row.amountCents}-${index}`}>
                        <Table.Td>{row.date}</Table.Td>
                        <Table.Td>{row.merchant}</Table.Td>
                        <Table.Td ta="right">
                          <Amount cents={row.amountCents} />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            )}

            <Button
              onClick={confirm}
              disabled={preview.plan.toInsert.length === 0 || busy}
              loading={busy}
            >
              Import {preview.plan.toInsert.length}
            </Button>
          </Stack>
        </Card>
      )}
    </Stack>
  )
}
