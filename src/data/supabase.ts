/**
 * The Supabase client.
 *
 * This app has no server tier: the browser talks to PostgREST directly with
 * the anon key, and Row Level Security is what keeps one account's ledger out
 * of another's (see `supabase/migrations/20260913120000_initial_schema.sql`). The anon
 * key is meant to ship in the bundle — it identifies the project, it does not
 * grant anything — so it goes in `.env` as a build-time constant like any
 * other config. The service-role key must never appear in this directory.
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Whether the build was given a project to talk to. A missing key is a
 * configuration mistake rather than an error state, so the app says so on
 * screen instead of failing at import time with a blank page.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(
  url ?? 'http://localhost',
  anonKey ?? 'anon',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The magic link comes back with its code in the URL; the client trades it
      // for a session and then the app strips the query (see `useSession`).
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
)
