/**
 * The only module that knows what the database looks like.
 *
 * Everything above this file works in the domain types from `src/budget/types`
 * — camel-cased, money in cents, dates as strings — and everything below is
 * snake_cased Postgres rows. Mapping in one place means a column rename never
 * reaches a component, and it is where the cents convention is enforced at the
 * boundary: a row's `amount_cents` is an `integer` on the way in and out, so
 * nothing here ever multiplies or divides by 100.
 *
 * Reads are deliberately whole-table. A personal ledger is a few thousand rows
 * after a decade, which is one round trip and a few hundred kilobytes, and
 * having all of it in memory is what lets the dashboard compute every budget's
 * carried-forward balance without a query per budget. If that stops being true,
 * the place to fix it is here — a date-bounded read plus a stored opening
 * balance — not by scattering queries through the views.
 */
import { supabase } from './supabase'
import type { CsvRow } from '../budget/csv'
import type {
  AutoLinkExpression,
  BankAccount,
  Budget,
  ImportedTransaction,
  Transaction,
} from '../budget/types'

/** Turns a PostgREST error into something worth putting on screen. */
function failed(action: string, error: { message: string } | null): never {
  throw new Error(`Could not ${action}: ${error?.message ?? 'unknown error'}`)
}

interface BankAccountRow {
  id: string
  name: string
  multiplier: number
}

interface BudgetRow {
  id: string
  name: string
  icon: string
  amount_cents: number
  start_date: string
}

interface SplitRow {
  id: string
  budget_id: string
  amount_cents: number
  note: string
}

interface TransactionRow {
  id: string
  date: string
  merchant: string
  amount_cents: number
  transaction_splits: SplitRow[] | null
}

interface ImportedRow {
  id: string
  bank_account_id: string
  date: string
  merchant: string
  amount_cents: number
  transaction_id: string | null
}

interface ExpressionRow {
  id: string
  expression: string
  budget_id: string
}

/** Everything the app works from, read in one go. */
export interface Ledger {
  accounts: BankAccount[]
  budgets: Budget[]
  transactions: Transaction[]
  imported: ImportedTransaction[]
  expressions: AutoLinkExpression[]
}

export async function fetchLedger(): Promise<Ledger> {
  const [accounts, budgets, transactions, imported, expressions] =
    await Promise.all([
      fetchAccounts(),
      fetchBudgets(),
      fetchTransactions(),
      fetchImported(),
      fetchExpressions(),
    ])

  return { accounts, budgets, transactions, imported, expressions }
}

async function fetchAccounts(): Promise<BankAccount[]> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, name, multiplier')
    .order('name')

  if (error) failed('load bank accounts', error)

  return (data as BankAccountRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    // The column is a smallint constrained to -1 or 1; narrow it here so the
    // domain type stays a union rather than a number.
    multiplier: row.multiplier < 0 ? -1 : 1,
  }))
}

async function fetchBudgets(): Promise<Budget[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('id, name, icon, amount_cents, start_date')
    .order('name')

  if (error) failed('load budgets', error)

  return (data as BudgetRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    amountCents: row.amount_cents,
    startDate: row.start_date,
  }))
}

async function fetchTransactions(): Promise<Transaction[]> {
  // One request with an embedded resource rather than two and a join in JS:
  // PostgREST reads the foreign key and returns the splits nested.
  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, date, merchant, amount_cents, transaction_splits (id, budget_id, amount_cents, note)',
    )
    .order('date', { ascending: false })

  if (error) failed('load transactions', error)

  return (data as TransactionRow[]).map((row) => ({
    id: row.id,
    date: row.date,
    merchant: row.merchant,
    amountCents: row.amount_cents,
    splits: (row.transaction_splits ?? []).map((split) => ({
      id: split.id,
      budgetId: split.budget_id,
      amountCents: split.amount_cents,
      note: split.note,
    })),
  }))
}

async function fetchImported(): Promise<ImportedTransaction[]> {
  const { data, error } = await supabase
    .from('imported_transactions')
    .select('id, bank_account_id, date, merchant, amount_cents, transaction_id')
    .order('date', { ascending: false })

  if (error) failed('load imported transactions', error)

  return (data as ImportedRow[]).map((row) => ({
    id: row.id,
    bankAccountId: row.bank_account_id,
    date: row.date,
    merchant: row.merchant,
    amountCents: row.amount_cents,
    transactionId: row.transaction_id,
  }))
}

async function fetchExpressions(): Promise<AutoLinkExpression[]> {
  const { data, error } = await supabase
    .from('auto_link_expressions')
    .select('id, expression, budget_id')
    .order('position')
    .order('expression')

  if (error) failed('load auto-link expressions', error)

  return (data as ExpressionRow[]).map((row) => ({
    id: row.id,
    expression: row.expression,
    budgetId: row.budget_id,
  }))
}

// Writes --------------------------------------------------------------------
//
// Anything spanning two tables goes through an RPC (see
// `supabase/migrations/20260913120100_functions.sql`), because PostgREST gives one
// transaction per request and a half-saved transaction is a budget that no
// longer adds up.

export interface SplitInput {
  budgetId: string
  amountCents: number
  note: string
}

/**
 * Inserts or updates a transaction together with its splits. The splits must
 * sum to `amountCents`; the function rejects the save if they do not, which is
 * the backstop behind the editor's own check.
 */
export async function saveTransaction(input: {
  id: string | null
  date: string
  merchant: string
  amountCents: number
  splits: readonly SplitInput[]
}): Promise<string> {
  const { data, error } = await supabase.rpc('save_transaction', {
    p_id: input.id,
    p_date: input.date,
    p_merchant: input.merchant,
    p_amount_cents: input.amountCents,
    p_splits: input.splits.map((split) => ({
      budget_id: split.budgetId,
      amount_cents: split.amountCents,
      note: split.note,
    })),
  })

  if (error) failed('save the transaction', error)

  return data as string
}

export async function deleteTransaction(id: string): Promise<void> {
  // The splits go with it by cascade, and any imported row that pointed at it
  // returns to the unlinked queue rather than being destroyed.
  const { error } = await supabase.from('transactions').delete().eq('id', id)

  if (error) failed('delete the transaction', error)
}

/** Creates a transaction per imported row and links them, all or nothing. */
export async function linkImportedToBudgets(
  links: readonly { importedId: string; budgetId: string; note: string }[],
): Promise<number> {
  const { data, error } = await supabase.rpc('link_imported_transactions', {
    p_links: links.map((link) => ({
      imported_id: link.importedId,
      budget_id: link.budgetId,
      note: link.note,
    })),
  })

  if (error) failed('link the transactions', error)

  return data as number
}

/** Attaches an imported row to a transaction that was already entered. */
export async function linkImportedToTransaction(
  importedId: string,
  transactionId: string,
): Promise<void> {
  const { error } = await supabase.rpc('link_imported_to_transaction', {
    p_imported_id: importedId,
    p_transaction_id: transactionId,
  })

  if (error) failed('link the transaction', error)
}

/**
 * Detaches an imported row, returning it to the unlinked queue.
 *
 * The transaction it was linked to is left alone: unlinking says "these were
 * not the same event after all", not "this spending did not happen". Deleting
 * the transaction instead is the other correction, and that path returns the
 * bank row to the queue by itself through the foreign key.
 */
export async function unlinkImported(importedId: string): Promise<void> {
  const { error } = await supabase
    .from('imported_transactions')
    .update({ transaction_id: null })
    .eq('id', importedId)

  if (error) failed('unlink the transaction', error)
}

/**
 * Corrects an imported row, or adds one by hand.
 *
 * Editing what the bank said is a strange thing to want, and it is here for the
 * same reason the Django admin allowed it: a statement that was imported
 * against the wrong account, or with a date the reader misread, otherwise has
 * no fix short of deleting and re-importing the file. The link is not touched —
 * `unlinkImported` is the operation for that.
 *
 * Changing the date or amount of a linked row will make it disagree with its
 * transaction; nothing stops that, because which of the two is wrong is a
 * judgement only a human can make.
 */
export async function saveImported(input: {
  id: string | null
  bankAccountId: string
  date: string
  merchant: string
  amountCents: number
}): Promise<void> {
  const row = {
    bank_account_id: input.bankAccountId,
    date: input.date,
    merchant: input.merchant,
    amount_cents: input.amountCents,
  }

  const { error } = input.id
    ? await supabase
        .from('imported_transactions')
        .update(row)
        .eq('id', input.id)
    : await supabase.from('imported_transactions').insert(row)

  if (error) failed('save the imported transaction', error)
}

/** Reads back what is already imported for an account, for the dedup check. */
export async function fetchImportedForAccount(
  accountId: string,
): Promise<{ date: string; amountCents: number }[]> {
  const { data, error } = await supabase
    .from('imported_transactions')
    .select('date, amount_cents')
    .eq('bank_account_id', accountId)

  if (error) failed('check for already-imported rows', error)

  return (data as { date: string; amount_cents: number }[]).map((row) => ({
    date: row.date,
    amountCents: row.amount_cents,
  }))
}

/** Inserts the rows an import decided were new. One request, so atomic. */
export async function insertImported(
  accountId: string,
  rows: readonly CsvRow[],
): Promise<void> {
  if (rows.length === 0) return

  const { error } = await supabase.from('imported_transactions').insert(
    rows.map((row) => ({
      bank_account_id: accountId,
      date: row.date,
      merchant: row.merchant,
      amount_cents: row.amountCents,
    })),
  )

  if (error) failed('save the imported transactions', error)
}

export async function deleteImported(id: string): Promise<void> {
  const { error } = await supabase
    .from('imported_transactions')
    .delete()
    .eq('id', id)

  if (error) failed('delete the imported transaction', error)
}

// Setup: budgets, accounts and auto-link rules ------------------------------
//
// The Django app kept these in its admin site. There is no admin site here, so
// they are ordinary screens and ordinary writes.

export async function saveBudget(input: {
  id: string | null
  name: string
  icon: string
  amountCents: number
  startDate: string
}): Promise<void> {
  const row = {
    name: input.name,
    icon: input.icon,
    amount_cents: input.amountCents,
    start_date: input.startDate,
  }

  const { error } = input.id
    ? await supabase.from('budgets').update(row).eq('id', input.id)
    : await supabase.from('budgets').insert(row)

  if (error) failed('save the budget', error)
}

export async function deleteBudget(id: string): Promise<void> {
  // The foreign key from splits is `on delete restrict`, so a budget with
  // spending against it fails here rather than quietly rewriting history.
  const { error } = await supabase.from('budgets').delete().eq('id', id)

  if (error) failed('delete the budget', error)
}

export async function saveAccount(input: {
  id: string | null
  name: string
  multiplier: -1 | 1
}): Promise<void> {
  const row = { name: input.name, multiplier: input.multiplier }

  const { error } = input.id
    ? await supabase.from('bank_accounts').update(row).eq('id', input.id)
    : await supabase.from('bank_accounts').insert(row)

  if (error) failed('save the bank account', error)
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('bank_accounts').delete().eq('id', id)

  if (error) failed('delete the bank account', error)
}

export async function saveExpression(input: {
  id: string | null
  expression: string
  budgetId: string
}): Promise<void> {
  const row = { expression: input.expression, budget_id: input.budgetId }

  const { error } = input.id
    ? await supabase
        .from('auto_link_expressions')
        .update(row)
        .eq('id', input.id)
    : await supabase.from('auto_link_expressions').insert(row)

  if (error) failed('save the auto-link rule', error)
}

export async function deleteExpression(id: string): Promise<void> {
  const { error } = await supabase
    .from('auto_link_expressions')
    .delete()
    .eq('id', id)

  if (error) failed('delete the auto-link rule', error)
}
