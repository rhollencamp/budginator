/**
 * The Supabase client.
 *
 * This app has no server tier: the browser talks to PostgREST directly with
 * the publishable key, and Row Level Security is what keeps one account's
 * ledger out of another's (see
 * `supabase/migrations/20260913120000_initial_schema.sql`). The publishable key
 * — what Supabase used to call the anon key, and still shows alongside it — is
 * meant to ship in the bundle: it identifies the project, it does not grant
 * anything. So it goes in `.env` as a build-time constant like any other
 * config. A secret key (formerly service_role) bypasses RLS entirely and must
 * never appear in this directory.
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Whether the build was given a project to talk to. A missing key is a
 * configuration mistake rather than an error state, so the app says so on
 * screen instead of failing at import time with a blank page.
 */
export const isSupabaseConfigured = Boolean(url && publishableKey)

export const supabase = createClient(
  url ?? 'http://localhost',
  publishableKey ?? 'publishable',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Signing in with a password puts nothing in the URL, but a password
      // recovery link sent from the dashboard does; this trades its code for a
      // session, and the app then strips the query (see `useSession`).
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
)
