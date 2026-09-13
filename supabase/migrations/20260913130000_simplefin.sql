-- Room for a bank sync alongside the CSV import.
--
-- The CSV importer has no identifier to work with: a statement re-exported
-- comes back with the merchant spelled differently and nothing that survives
-- between downloads, which is why `planImport` matches on (date, amount)
-- groups and why an imbalance it cannot explain stops and asks a human.
--
-- SimpleFIN does give a stable id, and a scheduled job has no human to ask. So
-- the sync gets a different duplicate check: the id goes in a column, the
-- column is unique, and re-fetching a window that overlaps the last one is a
-- no-op. Nothing here changes the CSV path, and an account can use either.

-- Which SimpleFIN account this one is. Null for the accounts that are still
-- imported by hand, which is every account until the sync is set up and may
-- stay so for any bank the bridge cannot reach.
alter table public.bank_accounts
  add column simplefin_account_id text unique
    check (simplefin_account_id is null or length(trim(simplefin_account_id)) > 0);

-- The row's id at the source, or null for a row that came from a CSV or was
-- typed in. Unique, so an insert of something already synced can be discarded
-- by the database rather than counted in the app: `on conflict do nothing` is
-- the whole of the sync's de-duplication.
--
-- SimpleFIN only promises a transaction id is unique *within* its account, so
-- what goes here is the pair, `<simplefin account id>:<transaction id>`.
-- `buildExternalId` in `src/budget/simplefin.ts` is what builds it.
--
-- Postgres treats nulls as distinct in a unique constraint, so the hand-entered
-- rows do not collide with each other.
alter table public.imported_transactions
  add column external_id text unique
    check (external_id is null or length(trim(external_id)) > 0);
