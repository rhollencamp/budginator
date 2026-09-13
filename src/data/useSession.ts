/**
 * Who is signed in.
 *
 * Sign-in is a six-digit code emailed to the user and typed into the app —
 * not a link, and that is the whole point. An installed PWA has its own
 * storage partition, separate from the browser's: on iOS emphatically so. A
 * magic link opens in Mail's in-app browser or Safari, Supabase exchanges it
 * for a session *there*, and the installed app is still signed out, looking at
 * a different store. Nothing can hand the session across, and a PWA cannot
 * claim the link either — iOS has no Universal Links for web apps.
 *
 * A code has no such problem: it is carried by the person, and the exchange
 * happens inside whichever context they typed it into. The same email still
 * carries a link for anyone signing in from a desktop browser, where following
 * it works fine.
 *
 * `onAuthStateChange` fires for the initial read as well as for every later
 * sign-in, sign-out and token refresh, so it is the only subscription needed —
 * there is no separate `getSession` call to race with it.
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

/**
 * Emails a sign-in code to the address given.
 *
 * One call sends both the code and the link — which of them the email shows is
 * decided by the project's email template, and this app's includes both (see
 * `docs/supabase.md`). `shouldCreateUser: false` means an address that has not
 * been invited gets nothing rather than becoming a new account: public sign-up
 * is off for this project, and the ledger is shared, so anyone who could sign
 * in could read everything.
 */
export async function sendSignInCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      // Only used by the link half of the email. Whatever this resolves to
      // must also be in the project's redirect allow-list, or the link
      // bounces. See `docs/supabase.md`.
      emailRedirectTo: signInRedirectUrl(window.location.href),
    },
  })

  if (error) throw new Error(error.message)
}

/**
 * Exchanges a code for a session. On success `onAuthStateChange` fires and the
 * app re-renders signed in, so there is nothing to return.
 *
 * A code is single-use and short-lived, so the common failures here are a
 * typo, an expired code, and one already spent by following the link in the
 * same email from somewhere else.
 */
export async function verifySignInCode(
  email: string,
  code: string,
): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  })

  if (error) throw new Error(error.message)
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
