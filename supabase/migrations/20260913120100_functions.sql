-- Operations that touch more than one table.
--
-- PostgREST wraps each request in a transaction, but a request only ever hits
-- one table: saving a transaction and its splits as two calls can leave the
-- second half undone, and a budget whose splits do not match its transaction
-- is exactly the corruption this app cannot tolerate. So anything spanning
-- tables lives here, where it is one statement and therefore atomic.
--
-- These are `security invoker` (the default), so Row Level Security still
-- applies with the caller's own uid — a function is not a way around the
-- policies, just a way to do several things at once under them.
--
-- `search_path` is pinned on each so a caller cannot shadow `public` with a
-- schema of their own and change which tables the body means.

-- Saves a transaction and replaces its splits.
--
-- `p_id` null inserts; otherwise the existing transaction is updated and its
-- splits are replaced wholesale — simpler than diffing, and the splits carry
-- no state worth preserving across an edit. Returns the transaction's id.
--
-- `p_splits` is a JSON array of `{budget_id, amount_cents, note}`. The splits
-- must sum to `p_amount_cents`: this is the one invariant the database refuses
-- to let the client get wrong, because every budget balance depends on it.
create or replace function public.save_transaction(
  p_id uuid,
  p_date date,
  p_merchant text,
  p_amount_cents integer,
  p_splits jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_total integer;
begin
  select coalesce(sum((split ->> 'amount_cents')::integer), 0)
    into v_total
    from jsonb_array_elements(p_splits) as split;

  if v_total <> p_amount_cents then
    raise exception
      'splits total % but the transaction is %', v_total, p_amount_cents
      using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into transactions (date, merchant, amount_cents)
      values (p_date, p_merchant, p_amount_cents)
      returning id into v_id;
  else
    update transactions
       set date = p_date,
           merchant = p_merchant,
           amount_cents = p_amount_cents
     where id = p_id
     returning id into v_id;

    if v_id is null then
      raise exception 'transaction % not found', p_id using errcode = 'no_data_found';
    end if;

    delete from transaction_splits where transaction_id = v_id;
  end if;

  insert into transaction_splits (transaction_id, budget_id, amount_cents, note)
  select v_id,
         (split ->> 'budget_id')::uuid,
         (split ->> 'amount_cents')::integer,
         coalesce(split ->> 'note', '')
    from jsonb_array_elements(p_splits) as split;

  return v_id;
end;
$$;

-- Turns imported bank rows into budgeted transactions and links them.
--
-- `p_links` is a JSON array of `{imported_id, budget_id, note}`. Each named row
-- gets a transaction with its own date, merchant and amount, a single split
-- against the given budget, and a link back. Rows already linked are skipped,
-- so a stale screen re-submitting cannot double-count.
--
-- This is one function rather than one call per row because the auto-link
-- screen confirms a whole page at once: a partial apply would leave the user
-- guessing which half went in.
create or replace function public.link_imported_transactions(p_links jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_link jsonb;
  v_imported imported_transactions%rowtype;
  v_transaction_id uuid;
  v_count integer := 0;
begin
  for v_link in select * from jsonb_array_elements(p_links)
  loop
    select * into v_imported
      from imported_transactions
     where id = (v_link ->> 'imported_id')::uuid
       for update;

    if not found or v_imported.transaction_id is not null then
      continue;
    end if;

    insert into transactions (date, merchant, amount_cents)
      values (v_imported.date, v_imported.merchant, v_imported.amount_cents)
      returning id into v_transaction_id;

    insert into transaction_splits (transaction_id, budget_id, amount_cents, note)
      values (
        v_transaction_id,
        (v_link ->> 'budget_id')::uuid,
        v_imported.amount_cents,
        coalesce(v_link ->> 'note', '')
      );

    update imported_transactions
       set transaction_id = v_transaction_id
     where id = v_imported.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Attaches an imported row to a transaction that was already entered by hand:
-- the same purchase, typed at the shop and posted by the bank days later.
-- Neither side may already be linked, so an accepted suggestion on a stale
-- screen fails loudly instead of stealing an existing link.
create or replace function public.link_imported_to_transaction(
  p_imported_id uuid,
  p_transaction_id uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated uuid;
begin
  update imported_transactions
     set transaction_id = p_transaction_id
   where id = p_imported_id
     and transaction_id is null
     and not exists (
       select 1 from imported_transactions other
        where other.transaction_id = p_transaction_id
     )
   returning id into v_updated;

  if v_updated is null then
    raise exception 'one of these is already linked'
      using errcode = 'unique_violation';
  end if;
end;
$$;
