/**
 * Where this build came from. `__GIT_SHA__` is substituted at build time (see
 * the `define` in `vite.config.ts`), so the running app can name the commit it
 * was built from — which is the only version number this project has: the
 * `version` in `package.json` is a placeholder for an app that is never
 * published to a registry.
 */

export const REPO_URL = 'https://github.com/rhollencamp/budginator'

/** Short sha of the commit this bundle was built from, or 'unknown'. */
export const GIT_SHA: string = __GIT_SHA__
