# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

Scope: widely-relevant technical choices only. What the app does with money is
documented separately, and subsystem detail lives in `docs/` — see Further
reading at the bottom.

## Commands

```bash
npm install          # install deps
npm run dev          # vite dev server
npm run build        # tsc -b (project references) && vite build
npm run lint         # oxlint (not eslint)
npm run format       # prettier --write .
npm run format:check # prettier --check . (what CI runs)
npm run test         # vitest run (single run, not watch mode)
npm run preview      # serve the production build locally
npm run icons        # re-render public/*.png from public/favicon.svg
```

Run a single test file with `npx vitest run src/budget/money.test.ts`, or
`npx vitest` (no `run`) for watch mode.

## Stack

- React 19 + TypeScript, built with Vite.
- Mantine is the UI and theming layer. `src/theme.ts` holds the theme: the
  `ledger` and `overdrawn` palettes, typography, and component defaults —
  including `size: 'md'` on every input, which is 16px and therefore the size
  below which iOS zooms the page on focus. The dark scheme is Mantine's own
  ramp, not a custom one; `src/styles/app.css` holds the little a theme object
  can't express, which is the light page background, two header tokens, the
  safe-area padding and the tabular-figures rule for money. Mantine styles are plain CSS with
  custom properties — no CSS-in-JS runtime, and no Sass in this repo.
- Supabase is the backing store, talked to directly from the browser. There is
  no server tier: GRANT and Row Level Security are what a request is checked
  against, and anything that writes across tables is a Postgres function.
- `vite-plugin-pwa` provides the web app manifest and generates the service
  worker.
- Linting is `oxlint`, configured via `.oxlintrc.json` — there is no ESLint
  config in this repo.
- Formatting is Prettier (`.prettierrc.json`: `semi: false`, `singleQuote:
true`), not `oxfmt`.
- `tsconfig.json` uses project references (`tsconfig.app.json` for `src/`,
  `tsconfig.node.json` for `vite.config.ts`), which is why `npm run build` runs
  `tsc -b` rather than plain `tsc`. Both have `strict` enabled.
- Node version is pinned in `.nvmrc` (also `engines.node` in `package.json`); CI
  reads it via `node-version-file`, so bumping Node only means editing `.nvmrc`.

## Architecture

Three layers, and the direction of dependency between them is the point.

`src/budget/` is the domain: the budgeting rules as pure functions, with no
React and no network. Money (`money.ts`), calendar dates (`dates.ts`), envelope
accrual (`budgets.ts`), CSV reading (`csv.ts`), import de-duplication
(`importer.ts`), link suggestion (`linking.ts`), merchant rules (`autoLink.ts`),
and split arithmetic (`transactions.ts`). Everything here is a function of its
arguments — including "today", which is always a parameter — so all of it is
testable without stubbing a clock or a server. **New rules about money go here,
not in a component.**

`src/data/` is the seam onto Supabase. `api.ts` is the only module that knows
what the database looks like: it maps snake_cased rows to the domain types and
back, so a column rename never reaches a component. `useLedger.ts` is the only
React seam onto the data — the `useGameLoop` of this repo — and `useSession.ts`
holds the auth state.

`src/ui/` is the screen layer. `App.tsx` holds a single `Screen` value
(`src/ui/navigation.ts` defines it) and the header's hamburger opens a drawer
that switches it. There is no router: a budgeting app is a handful of screens
reached from a menu, deep links into a private ledger are worth nothing, and an
installed PWA relaunching at the top rather than on a half-finished screen is
worth something. `Screen` carries its parameters in the value, so "transactions
filtered to this budget" and "edit this transaction" are ordinary states rather
than parsed strings. The views take plain data and callbacks; only `App.tsx`
knows they are backed by a network.

Tests live alongside the code they cover — Vitest with a jsdom environment
(`vitest.config.ts`). `src/budget/*.test.ts` covers the domain and is where most
of the coverage is; `src/ui/*.test.tsx` covers the four screens with real logic
in them — the dashboard's figures, the split editor's balancing, Setup's rule
editing and imported-row corrections, and sign-in — rendered through
`src/test/render.tsx` so they exercise the real theme. `App.tsx`, the
data layer and the service-worker wiring aren't unit tested — a fake of
PostgREST proves nothing — and are verified by running the app. The exception
is `api.test.ts`, which covers the read retry policy: that one decides for
itself whether to repeat a request, and nothing about it needs a server.

## Gotchas

- **Money is integer cents, everywhere.** Every amount column is `integer`,
  every domain field is named `...Cents`, and nothing anywhere divides by 100
  except `formatAmount` on the way to the screen. The money form is a
  `TextInput`, not Mantine's `NumberInput`, precisely because a numeric input
  hands back a float and `12.30` arriving as `12.299999999999999` is the bug
  class this app exists to avoid. Text becomes cents in exactly one place,
  `parseAmount`, and it returns `null` rather than guessing — including for
  three or more decimal places, which is a sign the column was misread and is
  rejected rather than rounded.
- **Dates are `YYYY-MM-DD` strings, never `Date`.** A transaction happens on a
  day, not at an instant. `new Date('2024-03-01')` is midnight UTC, which is the
  last day of February for anybody west of Greenwich — and that shifts a
  transaction into the wrong month's budget. `src/budget/dates.ts` reads and
  builds the string's own fields; the only `Date` in the domain is in `today()`,
  where the local calendar day is what is wanted. The date field is a native
  `<input type="date">` for the same reason: its value is already this shape.
- **Splits must sum to their transaction, and two layers enforce it.** The
  editor will not save an unbalanced set, and `save_transaction` refuses again
  in the database. The check is exact because it is in cents. Do not relax
  either — every budget balance is computed from the splits, so an unbalanced
  transaction is a budget that no longer adds up to the money that left the
  account.
- **Anything writing across two tables is a Postgres function.** PostgREST gives
  one transaction per request and a request touches one table, so a
  transaction-plus-splits save done as two calls can half-succeed. See
  `supabase/migrations/20260913120100_functions.sql`. They are `security invoker`, so RLS
  still applies — a function is a way to do several things at once _under_ the
  policies, never a way around them.
- **Reads are whole-table and writes are read-through.** `fetchLedger` pulls
  everything and every action reloads it. For a personal ledger that is one
  round trip over a few thousand rows, and it buys the property that matters
  more than latency here: the numbers on screen are always what the database
  would say if asked. Optimistic updates would make a balance that is briefly
  right and then quietly wrong, which is this app's worst failure mode. If the
  row count ever does become a problem, fix it in `api.ts` with a date-bounded
  read and a stored opening balance — not by scattering queries through views.
- **A cold start can be told its token is from the future.** `iat` is stamped
  by the auth server and checked by PostgREST against its own clock, so a
  just-minted token can lose a race with a fraction of a second of skew —
  `JWT issued at future`. `fetchLedger` retries it (`retryTransient` in
  `api.ts`), reads only: a repeated whole-table read costs a round trip, a
  repeated write is a duplicate transaction. And until one read has landed the
  app draws no screen, because a screen drawn from the empty starting ledger
  says "no budgets yet" to somebody who has plenty. `docs/supabase.md` has the
  longer version.
- **The service worker caches the shell and no data.** The app opens instantly
  and offline; the ledger is always fetched fresh. A cached balance is one that
  can be wrong without saying so. Offline entry, if ever wanted, is an outbox —
  queued writes replayed on reconnect — not a read cache.
- **De-duplication is per (date, amount) group, not per row.** Two identical
  coffees on one day are two transactions, so the importer compares how many the
  file has against how many are recorded and inserts the difference. See
  `docs/budgeting.md`; the test that pins it is the idempotency case in
  `importer.test.ts`.
- **Sign-in is email and password, and that is forced by the PWA.** An
  installed PWA has its own storage partition, so anything that leaves the app
  and comes back cannot carry a session home: a magic link opened in Mail or
  Safari signs in the browser and leaves the installed app signed out, and iOS
  has no Universal Links for web apps to redirect it. An emailed code would fix
  that, but Supabase only sends one when the Magic Link template contains
  `{{ .Token }}`, and editing templates requires custom SMTP. So the app sends
  no email at all. There is no sign-up screen either — accounts are made in the
  Supabase dashboard, because the ledger is shared.
- **One shared ledger, and sign-in is what guards it.** There is no `user_id`
  column: this is a household budget kept by more than one person, so every
  table's policy is `to authenticated using (true) with check (true)` and
  everyone signed in sees the same data. What keeps it private is that public
  sign-up is disabled for the project — a setting, not a constraint. Adding a
  table means adding RLS and a policy to match, or it silently belongs to
  nobody. `docs/supabase.md` has the allowlist form to tighten to if the
  sign-in boundary ever stops being enough.
- **GRANT comes before RLS.** A role needs table privileges as well as a
  policy, and the two fail differently — a missing grant raises
  `permission denied`, while RLS excluding everything is a silent empty
  result. A new table needs both; the grants migration's `alter default privileges`
  covers the second for anything added later. The publishable key ships in the
  bundle by design; a secret key must never appear in this repo.
- **Colour scheme before first paint:** the inline script in `index.html` sets
  `data-mantine-color-scheme` on `<html>` (Mantine's `<ColorSchemeScript>` can't
  run early enough in a client-only app). Its `localStorage` key and `auto`
  handling have to stay in step with the `defaultColorScheme` passed to
  `MantineProvider` in `App.tsx`, and with the Settings screen.
- **Viewport units on an installed iOS app:** `.app-shell` takes `100svh` in a
  tab but `100vh` under `@media (display-mode: standalone)`. iOS misreports the
  dynamic units on a cold start, and a cold start is every launch there. Do not
  fold the two into a `max()` — that hands a tab the taller figure and
  reintroduces the rubber-band the `svh` rule exists to avoid.
- **App icons:** `public/favicon.svg` is the only hand-edited icon; the PNGs
  beside it come from `npm run icons` and should never be edited directly.
- **Build stamp:** the drawer's footer names the commit the running bundle was
  built from, because `package.json`'s `version` is a placeholder for an app
  that is never published. `vite.config.ts` bakes the short sha in as a
  `__GIT_SHA__` define; `src/buildInfo.ts` is the only module that reads it.
  Vitest does not read `vite.config.ts`, so `vitest.config.ts` carries the same
  define with a stub value — another build-time constant means adding it in both
  places.
- **Base path:** `base` is `'./'` and the manifest's `start_url`/`scope` are
  `'.'`, so the build works at a domain root, at a project subpath, or under
  `vite preview` without being rebuilt. Keep them relative together.

## Further reading

- `docs/budgeting.md` — envelopes, splits, and the import pipeline.
- `docs/supabase.md` — project setup, RLS, and why some writes are RPCs.
- `docs/pwa.md` — the service worker, the update flow, and what is not cached.
- `docs/deployment.md` — the Pages pipeline, its repository variables, and the
  guard that stops a secret key reaching the bundle.
