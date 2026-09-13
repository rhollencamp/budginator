/**
 * Who is signed in.
 *
 * Auth is Supabase's email magic link: the user asks for a link, follows it,
 * and the client trades the code in the URL for a session it then keeps in
 * localStorage. `onAuthStateChange` fires for the initial read as well as for
 * every later sign-in, sign-out and token refresh, so it is the only
 * subscription needed — there is no separate `getSession` call to race with it.
 */
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface SessionState {
  session: Session | null
  /** True until the stored session has been read; the app shows nothing yet. */
  loading: boolean
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    session: null,
    loading: true,
  })

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false })

      // The magic link lands with its code in the query string. Once it has
      // been exchanged, take it out of the URL so a reload — or a bookmark, or
      // the browser's session restore — does not replay a spent code.
      if (session && window.location.search.includes('code=')) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    })

    return () => data.subscription.unsubscribe()
  }, [])

  return state
}

/**
 * Where a magic link should land: the directory the app is served from.
 *
 * Not `origin + BASE_URL`. `base` is `'./'` (see `vite.config.ts`) so the build
 * works at a domain root or a project subpath without being rebuilt, which
 * makes `BASE_URL` the string `'./'` — and concatenating that onto an origin
 * gives `https://example.github.io./`, a URL that is malformed rather than
 * merely wrong. Resolving `'.'` against the current location gets the real
 * directory in every case: `/budginator/` on Pages, `/` at a domain root,
 * `/` under `vite preview`.
 *
 * Exported for its test; a URL that is only wrong in production is exactly the
 * kind worth pinning down.
 */
export function signInRedirectUrl(href: string): string {
  return new URL('.', href).href
}

/** Sends a sign-in link to the address given. */
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Whatever this resolves to must also be in the Supabase project's
      // redirect allow-list, or the link bounces. See `docs/supabase.md`.
      emailRedirectTo: signInRedirectUrl(window.location.href),
    },
  })

  if (error) throw new Error(error.message)
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
