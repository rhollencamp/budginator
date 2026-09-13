# Supabase

The app talks to Supabase directly from the browser. There is no server tier,
so two things carry the weight that a backend usually would: **Row Level
Security**, which is the entire access control story, and the **RPC functions**,
which are the only way to write across more than one table atomically.

## Setting up a project

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migrations in `supabase/migrations/`. Three ways, in increasing
   order of ceremony — see "Running migrations" below for which to pick:

   ```bash
   # The CLI, against the hosted project
   supabase init          # only once, to generate supabase/config.toml
   supabase link --project-ref <ref>
   supabase db push
   ```

3. Under **Authentication → Providers**, leave Email enabled. Turn **Confirm
   email** on and password sign-in off if you want magic links only.
4. Under **Authentication → URL Configuration**, add the app's URL to the
   redirect allow-list. Local development needs `http://localhost:5173/` there
   too, or the sign-in link bounces.

   The URL the app asks to be sent back to is the **directory it is served
   from**, which `signInRedirectUrl` in `src/data/useSession.ts` derives from
   the current location — `https://<user>.github.io/budginator/` on Pages,
   `http://localhost:5173/` in development. Add each one you use. The trailing
   slash matters.

5. Copy the project URL and the anon key from **Project Settings → API** into
   `.env` (see `.env.example`).

The anon key is meant to ship in the bundle. It identifies the project and
grants nothing by itself; the policies below are what stop one account reading
another's ledger. The **service-role key bypasses RLS entirely** and must never
appear in this repository or in a built bundle.

## Running migrations

Migration files are named `<14-digit timestamp>_<name>.sql`, which is the
format the Supabase CLI requires — it reads the timestamp as the version and
records it in `supabase_migrations.schema_migrations`, so a file it cannot
parse is one it will not apply. Keep new ones in that shape; `supabase
migration new <name>` produces it.

**The SQL editor.** Paste each file into the dashboard's SQL editor, oldest
first. Fine for the initial setup and nothing else: the CLI does not learn that
they ran, so the first `db push` afterwards will try to apply them again.

**The CLI.** `supabase db push` applies everything not yet recorded. This is the
straightforward option for a project with one maintainer, and the one to use if
you are only ever going to run migrations from your own machine.

**The GitHub integration.** Supabase can watch this repository and apply new
migrations itself when they land on the production branch, which is Supabase
Branching (Project Settings → Integrations → GitHub). It also spins up an
ephemeral preview database per pull request, seeded from the migrations on that
branch, so a schema change can be reviewed against a real database rather than
read. It needs `supabase/config.toml` committed — `supabase init` writes it —
and Branching is a paid-plan feature, so check that before wiring it up.

Whichever you choose, choose one. Applying a migration by hand in the SQL editor
_and_ having something else apply it leaves the two disagreeing about what has
run, which surfaces later as a `db push` failing on an object that already
exists.

## Row Level Security

Every table has `user_id uuid not null default auth.uid()` and one policy:

```sql
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()))
```

Both halves matter. `using` decides which rows you can see and change; `with
check` decides what a row may look like afterwards, and without it an update
could hand a row to another account. The `(select auth.uid())` wrapping is not
cosmetic — it lets Postgres evaluate the function once per statement rather than
once per row, which on a whole-table read is the difference between a fast query
and a slow one.

Because `user_id` defaults to `auth.uid()`, no insert in `src/data/api.ts` names
it. That is deliberate: there is no code path that could name the wrong one.

## Why there are RPC functions

PostgREST wraps each HTTP request in a transaction, but a request only ever
touches one table. Saving a transaction and then its splits as two calls can
leave the second undone — and a transaction whose splits do not sum to its
amount is precisely the corruption this app cannot tolerate, because every
budget balance is computed from those splits.

So anything spanning tables is a function in the functions migration:

- `save_transaction` — upserts a transaction and replaces its splits, refusing
  the save if they do not sum to the transaction's amount. This is the backstop
  behind the editor's own check, and the reason the invariant cannot be broken
  by a stale tab or a hand-written request.
- `link_imported_transactions` — turns imported rows into transactions and links
  them, in one go. The auto-link screen confirms a whole page at a time; a
  partial apply would leave you guessing which half went in. Rows that are
  already linked are skipped, so a stale screen cannot double-count.
- `link_imported_to_transaction` — attaches a bank row to a transaction entered
  by hand, failing if either side is already linked.

They are `security invoker`, so RLS still applies with the caller's own uid. A
function here is a way to do several things at once _under_ the policies, never
a way around them. Each pins `search_path` so a caller cannot shadow `public`
and change which tables the body means.

## Schema notes

- Every amount is `integer` cents. Not `numeric`, and certainly not a float.
- Dates are `date`, not `timestamptz`. A transaction happens on a day.
- `transaction_splits.budget_id` is `on delete restrict`: deleting a budget that
  still has spending against it would silently rewrite history, so the app makes
  you move the splits first.
- `imported_transactions.transaction_id` is `on delete set null` and `unique`:
  deleting a transaction returns its bank row to the unlinked queue rather than
  destroying the bank's own record.
