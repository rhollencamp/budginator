/**
 * Who is signed in.
 *
 * Auth is email and password, and the reason is the PWA. An installed PWA has
 * its own storage partition, separate from the browser's — on iOS emphatically
 * so — and anything that leaves the app to come back cannot carry a session
 * home. A magic link opens in Mail's in-app browser or in Safari, the session
 * is created *there*, and the installed app is still signed out, looking at a
 * different store. A link cannot be made to open in the app either: iOS has no
 * Universal Links for web apps.
 *
 * An emailed code would have solved that — the person carries it, so the
 * exchange happens inside the app — but Supabase only sends a code if the
 * project's email template contains `{{ .Token }}`, and editing templates
 * requires custom SMTP, which this project does not have.
 *
 * A password is typed into the app and never leaves it. No email, so none of
 * the above applies, and no dependence on the project's mail setup at all.
 * There is no sign-up here: accounts are created in the Supabase dashboard,
 * because the ledger is shared and anyone who can sign in can read everything.
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

      // A password sign-in puts nothing in the URL, but a recovery link
      // followed from the dashboard does. Strip it once it has been exchanged,
      // so a reload — or a bookmark, or the browser's session restore — does
      // not replay a spent code.
      if (session && window.location.search.includes('code=')) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    })

    return () => data.subscription.unsubscribe()
  }, [])

  return state
}

/**
 * Signs in with an email and password.
 *
 * Deliberately not `signUp`: an account that could be created from the sign-in
 * screen would be an account that can read the whole household ledger. People
 * are added in the Supabase dashboard, under Authentication → Users.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) throw new Error(error.message)
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
