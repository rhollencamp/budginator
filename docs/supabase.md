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

3. Under **Authentication → Providers → Email**, leave the provider enabled,
   leave **Enable email password** on, and turn **Allow new users to sign up**
   off. The ledger is shared, so anyone who can sign in can read everything.
4. Create the accounts under **Authentication → Users → Add user → Create new
   user**. Set a password there and tick **Auto Confirm User**. This sends no
   email, which is the point — see "Why a password" below.
5. Copy the project URL and the publishable key from **Project Settings → API
   Keys** into `.env` (see `.env.example`).

There is no redirect allow-list to configure and no email template to edit,
because the app never sends mail.

## Why a password

Passwordless would have been nicer, and both forms of it are unavailable here.

An installed PWA has its own storage partition, separate from the browser's —
on iOS emphatically so. A **magic link** opens in Mail's in-app browser or in
Safari, Supabase exchanges it for a session **there**, and the installed app is
still signed out, looking at a different store. Nothing can hand the session
across, and a PWA cannot claim the link either: iOS has no Universal Links for
web apps.

An **emailed code** solves that, because the person carries the code and the
exchange happens inside the app. But Supabase only sends a code when the
project's Magic Link template contains `{{ .Token }}` — the default carries
only `{{ .ConfirmationURL }}`, which is what makes it a link — and editing
email templates requires custom SMTP. Without that, a code cannot be sent at
all.

So: a password, typed into the app, never leaving it. No email is involved in
signing in, which also means no SMTP setup, no template, and no rate limit on
the built-in mail service. `autocomplete="username"` and
`autocomplete="current-password"` are on the two fields so a password manager
fills both in one tap.

Resetting a password is a dashboard job, under Authentication → Users. An
in-app reset link would land back in the browser rather than the installed app
— the same problem as the magic link, one step removed.

## Which key

A project shows two kinds, and only one of them belongs anywhere near this
repository.

| Key             | Looks like           | Where it goes                   |
| --------------- | -------------------- | ------------------------------- |
| **Publishable** | `sb_publishable_...` | `VITE_SUPABASE_PUBLISHABLE_KEY` |
| **Secret**      | `sb_secret_...`      | Nowhere in this repo            |

The publishable key is meant to ship in the bundle. It identifies the project
and grants nothing by itself; the policies below are what stop one account
reading another's ledger.

A **secret key bypasses RLS entirely**. Everything this app is configured with
is compiled into a public JavaScript file, so a secret key set here would hand
the whole database to anyone who opens devtools — and making it a GitHub
_secret_ rather than a variable does not help, because the build's own output is
the thing that leaks it. There is no server tier here, so there is no correct
place for one at all. The deploy workflow refuses to build if the value looks
like a secret key.

Older projects call these the **anon** and **service_role** keys, and a project
that predates the change shows both namings. They are equivalent for this app's
purposes: anon ↔ publishable, service_role ↔ secret. The publishable key is a
drop-in for the anon key in `createClient`, which is why the rename needed no
code change beyond the variable's name. If your dashboard offers both, prefer
the `sb_publishable_...` one — the JWT-shaped legacy keys are on their way out.

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

## Two gates: GRANT, then RLS

These are independent, and a schema needs both. GRANT decides whether a role may
touch a table at all; RLS decides which rows it then sees. GRANT is checked
first, so a table with perfect policies and no grant refuses every request.

The two failures look nothing alike, which is the quickest way to tell them
apart when something is denied:

| Missing                | What you see                                    |
| ---------------------- | ----------------------------------------------- |
| **GRANT**              | `permission denied for table ...` (error 42501) |
| **RLS allows no rows** | no error, an empty result                       |

Supabase's dashboard table editor issues grants for you, so a project built by
clicking never meets this. A schema applied as raw SQL has to say it, which is
what the grants migration does: `authenticated` gets table access, `anon` gets
schema usage alone, and `alter default privileges` covers tables added later.

## One shared ledger

There is no `user_id` on any table. Every signed-in user sees the same ledger:

```sql
create policy "signed in" on public.budgets
  for all to authenticated using (true) with check (true);
```

This is a household budget, kept by the people in the household, so per-user
rows were the wrong shape — the schema started with them and the second person
to sign in saw an empty app while budgeting against the same bank accounts.
The shared-ledger migration drops the column and rewrites the policies.

**What keeps the ledger private is therefore who can sign in at all.** Public
sign-up is turned off for the project, and users are added by invitation. That
is a project setting rather than a database constraint, which is the tradeoff
worth understanding: re-enable sign-up and anyone who registers can read
everything. If that ever becomes a risk — sharing the URL more widely, say —
the stricter form is a policy gated on an allowlist:

```sql
using ((select auth.jwt() ->> 'email') in ('you@example.com', 'them@example.com'))
```

RLS stays enabled and every table keeps a policy even though the policy admits
all authenticated users. `anon` is refused twice over, holding neither a grant
nor a policy, and a table with RLS enabled and no policy denies everyone — a
confusing way to discover a missing grant later.

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
