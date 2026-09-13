# Budginator

Envelope budgeting, as an installable PWA.

Each budget is topped up by the same amount every month and whatever you do not
spend carries forward, so a quiet month pays for a heavy one. Spending is
entered by hand as it happens, the bank's own record is imported afterwards and
reconciled against it, and one transaction can be split across several budgets.

Every amount is held as a whole number of cents — in the database, in the app,
and in every calculation. No floating point anywhere.

## Stack

- React + TypeScript + Vite
- Mantine for UI and theming
- Supabase (Postgres + auth) as the backing store, talked to directly from the
  browser with Row Level Security as the access control
- `vite-plugin-pwa` for the manifest and service worker

## Develop

```bash
npm install
cp .env.example .env   # then fill in from your Supabase project
npm run dev
```

Setting up the Supabase side — running the migrations, creating the accounts
that can sign in, what the publishable key is and is not — is in
[`docs/supabase.md`](docs/supabase.md).

## Commands

```bash
npm run dev          # vite dev server
npm run build        # tsc -b (project references) && vite build
npm run lint         # oxlint (not eslint)
npm run format       # prettier --write .
npm run format:check # prettier --check . (what CI runs)
npm run test         # vitest run (single run, not watch mode)
npm run preview      # serve the production build locally
npm run icons        # re-render public/*.png from public/favicon.svg
```

## Further reading

- [`docs/budgeting.md`](docs/budgeting.md) — envelopes, splits, and the import
  pipeline: what the app actually does with your money.
- [`docs/supabase.md`](docs/supabase.md) — project setup, Row Level Security,
  and why some writes are RPC functions.
- [`docs/pwa.md`](docs/pwa.md) — service worker, the update flow, and what is
  deliberately not cached.
- [`docs/deployment.md`](docs/deployment.md) — the GitHub Pages pipeline, the
  repository variables it needs, and why the base path is relative.
