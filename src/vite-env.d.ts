/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * Short git sha of the commit this bundle was built from, substituted by the
 * `define` in `vite.config.ts` (and by `vitest.config.ts` under test).
 */
declare const __GIT_SHA__: string

interface ImportMetaEnv {
  /** The Supabase project URL, e.g. `https://abcdefgh.supabase.co`. */
  readonly VITE_SUPABASE_URL?: string
  /**
   * The project's publishable key (`sb_publishable_...`, formerly the anon
   * key). Public by design. Never a secret key — those bypass RLS.
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
