-- Budginator's schema.
--
-- Two rules run through all of it:
--
--  1. Money is integer cents. Every amount column is `integer`, never
--     `numeric` and certainly never a float, so a balance is the exact sum of
--     what went into it. `integer` tops out around $21 million, which is well
--     clear of what this app is for.
--
--  2. Every row belongs to a user, and Row Level Security is the only thing
--     enforcing that. The app talks to PostgREST straight from the browser
--     with the publishable key, so these policies are the access control —
--     there is no server tier to put a check in. `user_id` defaults to
--     `auth.uid()` so an insert never has to name it, and the `with check`
--     clauses stop a client from naming somebody else's.

create extension if not exists "pgcrypto";

-- Where imported rows came from, and which way that bank writes its numbers.
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- -1 for a statement that reports spending as a positive number, so that
  -- after multiplying, a debit is negative everywhere in the app.
  multiplier smallint not null check (multiplier in (-1, 1)),
  created_at timestamptz not null default now()
);

-- An envelope: topped up by `amount_cents` each month from `start_date` on,
-- with the balance carrying forward. Zero is a budget that is only a label.
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  icon text not null default '',
  amount_cents integer not null default 0 check (amount_cents >= 0),
  start_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- A transaction as budgeted. Spending is negative, income positive.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  merchant text not null default '',
  amount_cents integer not null,
  created_at timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, date desc);

-- Where a transaction's money went. The splits are expected to sum to the
-- transaction's amount; the app enforces that on save rather than the database,
-- because an editor has to be able to hold an unbalanced draft while it is
-- being edited and a deferred constraint would not survive a partial save.
create table public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  -- Restrict rather than cascade: deleting a budget that still has spending
  -- against it would silently rewrite history, so the app makes you move the
  -- splits first.
  budget_id uuid not null references public.budgets (id) on delete restrict,
  amount_cents integer not null,
  note text not null default ''
);

create index transaction_splits_transaction_idx on public.transaction_splits (transaction_id);
create index transaction_splits_budget_idx on public.transaction_splits (budget_id);

-- A row exactly as the bank exported it. `transaction_id` is null until it is
-- linked, and the unlinked rows are the import queue.
create table public.imported_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts (id) on delete cascade,
  date date not null,
  merchant text not null default '',
  amount_cents integer not null,
  -- One imported row per transaction and vice versa: a link is a statement
  -- that these are the same event. Set null on delete so removing a
  -- transaction returns its bank row to the queue rather than destroying it.
  transaction_id uuid unique references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Covers the import's duplicate check, which counts rows by account, date and
-- amount, and the unlinked queue, which filters on a null transaction_id.
create index imported_transactions_match_idx
  on public.imported_transactions (bank_account_id, date, amount_cents);
create index imported_transactions_unlinked_idx
  on public.imported_transactions (user_id, date desc)
  where transaction_id is null;

-- "Any merchant matching this expression belongs to this budget." Tried in
-- `position` order, first match wins, so a specific rule can precede a general
-- one.
create table public.auto_link_expressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expression text not null check (length(trim(expression)) > 0),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- Row Level Security ------------------------------------------------------
--
-- One policy per table, covering all four commands: a row is yours if its
-- user_id is your uid, and you may only write rows that stay yours. Without
-- `with check`, an update could hand a row to another account.

alter table public.bank_accounts enable row level security;
alter table public.budgets enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_splits enable row level security;
alter table public.imported_transactions enable row level security;
alter table public.auto_link_expressions enable row level security;

create policy "own rows" on public.bank_accounts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.budgets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.transaction_splits
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.imported_transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.auto_link_expressions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
