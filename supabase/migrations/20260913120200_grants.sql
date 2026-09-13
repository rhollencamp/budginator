-- Table privileges for the API roles.
--
-- Row Level Security and GRANT are two independent gates, and the schema so far
-- only closed one of them. RLS decides *which rows* a role may see; GRANT
-- decides whether it may touch the table at all, and it is checked first. So a
-- table with perfect policies and no grant fails every request with
-- "permission denied for table ..." (SQLSTATE 42501) before a policy is ever
-- consulted — which is what the app hit on its first real sign-in.
--
-- The two failure modes look nothing alike, which is worth remembering:
--
--   * missing GRANT  -> an error, "permission denied for table ..."
--   * RLS excludes    -> no error, an empty result
--
-- Supabase's dashboard table editor issues these grants for you, so a project
-- built by clicking never notices. A schema applied as raw SQL has to say it.
--
-- `authenticated` is the only role that gets table access: every policy in
-- `0001` is `to authenticated`, and nothing in this app is readable signed out.
-- `anon` gets schema usage alone, which is what it needs to reach the endpoint
-- and be told no.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.bank_accounts to authenticated;
grant select, insert, update, delete on table public.budgets to authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert, update, delete on table public.transaction_splits to authenticated;
grant select, insert, update, delete on table public.imported_transactions to authenticated;
grant select, insert, update, delete on table public.auto_link_expressions to authenticated;

-- The functions are `security invoker`, so they run with the caller's own
-- privileges and the grants above still apply inside them. This only says who
-- may call them.
grant execute on function public.save_transaction(uuid, date, text, integer, jsonb) to authenticated;
grant execute on function public.link_imported_transactions(jsonb) to authenticated;
grant execute on function public.link_imported_to_transaction(uuid, uuid) to authenticated;

-- So a table added by a later migration does not repeat this. Default
-- privileges apply only to objects created afterwards, and only by the role
-- named here — which is the role migrations run as.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated;
