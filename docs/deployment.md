# Deployment

The app is a static bundle. There is no server to run: the browser talks to
Supabase directly, so deploying is copying `dist/` somewhere that serves files.
It goes to GitHub Pages, built by Actions.

## The two workflows

**`ci.yml`** runs on every pull request and every push to `main`: lint, format
check, tests, build. The build there needs no Supabase project — the values are
compiled in, and a check build only has to compile.

**`deploy.yml`** runs on pushes to `main` and on manual dispatch. It repeats the
same four checks, then builds with the real configuration and publishes to
Pages.

Both read the Node version from `.nvmrc` via `node-version-file`, so bumping
Node means editing that one file.

## Configuration

The deploy needs two **repository variables** — Settings → Secrets and variables
→ Actions → **Variables**, not Secrets:

| Variable                        | Value                       |
| ------------------------------- | --------------------------- |
| `VITE_SUPABASE_URL`             | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...`        |

Variables rather than secrets because both are compiled into a public
JavaScript file and are meant to be. Masking them in the build log would hide
nothing — the build's own output is what publishes them. See "Which key" in
[`supabase.md`](supabase.md) for why a secret key must never be either.

They are read by the **build** job, which declares no `environment:`, so
environment-scoped variables would be out of scope there and resolve empty.
Repository scope is the one that works.

## The guard before the build

`deploy.yml` refuses to build in two cases, both of which would otherwise
produce a deploy that looks fine and is not:

- **Either variable unset.** The build would succeed and publish an app whose
  only screen says it is not configured — a failure that looks like a working
  deploy.
- **The key looks like a secret key** (`sb_secret_*`, `service_role*`, or a
  JWT). A secret key bypasses Row Level Security, and this value ends up in a
  public file, so the cost of the check is one `case` statement against
  publishing the whole database. The JWT arm catches both legacy key types,
  which cannot be told apart without decoding them — so a legacy anon key is
  refused too. Use the `sb_publishable_...` one.

## Why the base path is relative

`base` is `'./'` in `vite.config.ts`, and the manifest's `start_url` and `scope`
are `'.'`. That makes one build work at a domain root, at a project subpath
(`https://<user>.github.io/budginator/`, which is where Pages puts it), and
under `npm run preview` — without rebuilding for each.

Keep the three relative together. Pinning one to an absolute path and leaving
the others relative is how a service worker ends up scoped to somewhere the app
is not served from.

A consequence worth knowing, because it has already caused one bug: with a
relative base, `import.meta.env.BASE_URL` is the string `'./'`, so
`origin + BASE_URL` builds `https://host./` — malformed rather than merely
wrong. Resolve against the current location instead when a full URL is needed.

## Branch protection

`main` is what deploys and, if the Supabase GitHub integration is enabled, what
applies migrations. A rule requiring a pull request and a passing `check` is
worth having for that reason alone. Note that rulesets have a bypass list, and
"Repository admin" on it means your own direct pushes still go through — which
looks like the rule not working.
