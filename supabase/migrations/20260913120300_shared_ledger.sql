-- One shared household ledger, instead of one ledger per user.
--
-- The schema started out with a `user_id` on every row and policies scoping
-- each account to its own data. That is the right default for an app with
-- strangers in it, and the wrong shape for this one: a household budget is a
-- thing two people keep together, and per-user rows meant the second person to
-- sign in saw an empty app while budgeting against the same bank accounts.
--
-- So the column goes and the policies become "any signed-in user". What now
-- keeps the ledger private is that only invited people can sign in at all —
-- public sign-up is turned off for the project. That is a setting rather than
-- a constraint, which is worth knowing: if sign-up is ever re-enabled, anyone
-- who registers can read everything. The stricter alternative is a policy
-- gated on an allowlist of email addresses, and this is the migration to
-- change if that day comes.
--
-- RLS stays enabled and each table keeps a policy, even though the policy
-- admits every authenticated user. `anon` is denied twice over — no grants and
-- no policy — and a table with RLS on and no policy at all denies everyone,
-- which would be a confusing way to discover a missing grant later.

-- Policies depend on the column, so they go first.
drop policy "own rows" on public.bank_accounts;
drop policy "own rows" on public.budgets;
drop policy "own rows" on public.transactions;
drop policy "own rows" on public.transaction_splits;
drop policy "own rows" on public.imported_transactions;
drop policy "own rows" on public.auto_link_expressions;

-- Dropping the column takes its indexes and constraints with it: the
-- `unique (user_id, name)` on budgets and the two indexes that led on user_id.
-- They are rebuilt below without it.
alter table public.bank_accounts drop column user_id;
alter table public.budgets drop column user_id;
alter table public.transactions drop column user_id;
alter table public.transaction_splits drop column user_id;
alter table public.imported_transactions drop column user_id;
alter table public.auto_link_expressions drop column user_id;

-- Two budgets of the same name in one shared ledger is a mistake rather than a
-- feature, and the uniqueness is also what lets an import re-run safely.
alter table public.budgets add constraint budgets_name_key unique (name);

create index transactions_date_idx on public.transactions (date desc);
create index imported_transactions_unlinked_idx
  on public.imported_transactions (date desc)
  where transaction_id is null;

create policy "signed in" on public.bank_accounts
  for all to authenticated using (true) with check (true);
create policy "signed in" on public.budgets
  for all to authenticated using (true) with check (true);
create policy "signed in" on public.transactions
  for all to authenticated using (true) with check (true);
create policy "signed in" on public.transaction_splits
  for all to authenticated using (true) with check (true);
create policy "signed in" on public.imported_transactions
  for all to authenticated using (true) with check (true);
create policy "signed in" on public.auto_link_expressions
  for all to authenticated using (true) with check (true);
