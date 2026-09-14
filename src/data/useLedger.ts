/**
 * The one React seam onto the data, the way `useGameLoop` is in the `idle`
 * repo: components take what they need as props and call the actions they are
 * given, and only this hook knows that any of it came from a network.
 *
 * The model is read-through rather than optimistic. Every action writes and
 * then reloads the whole ledger, which for a personal budget is one round trip
 * over a few thousand rows, and buys something worth more than the latency: the
 * numbers on screen are always what the database would say if asked. An
 * envelope balance that is optimistically right and then quietly wrong is the
 * failure this app most needs to avoid — so the reload is the design, not a
 * shortcut waiting to be replaced by a cache.
 *
 * The same reasoning applies to coming back to the app. A phone keeps a PWA
 * alive for days, and the ledger is shared, so a tab restored on Tuesday would
 * otherwise show Monday's figures until something was saved. Returning to the
 * foreground therefore re-reads — but only once the data is older than
 * {@link STALE_AFTER_MS}, because on a phone every glance at another app and
 * back is a visibility change and re-reading the whole table each time would be
 * a round trip for nothing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLedger, type Ledger } from './api'

/**
 * How old the ledger may be before returning to the app re-reads it. Five
 * minutes is long enough that flicking to the banking app and back is free,
 * and short enough that a morning's session never opens on yesterday's
 * numbers.
 */
export const STALE_AFTER_MS = 5 * 60 * 1000

const EMPTY: Ledger = {
  accounts: [],
  budgets: [],
  transactions: [],
  imported: [],
  expressions: [],
}

export interface LedgerState {
  ledger: Ledger
  /** True until the first load finishes; a later refresh keeps data on screen. */
  loading: boolean
  /**
   * True once a load has actually succeeded. Until it has there is no ledger,
   * only a blank one, and a screen drawn from it would report an empty
   * household rather than a failed read.
   */
  loadedOnce: boolean
  /** True while a reload is in flight, for a quiet progress indicator. */
  refreshing: boolean
  error: string | null
  reload: () => Promise<void>
  /**
   * Runs a write and then reloads. Errors come back as the resolved value
   * rather than a rejection, so a caller can put the message beside the form
   * that caused it without a try/catch in every handler.
   */
  run: (action: () => Promise<unknown>) => Promise<string | null>
}

export function useLedger(enabled: boolean): LedgerState {
  const [ledger, setLedger] = useState<Ledger>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Two reads can be in flight at once — a write's reload starting while the
  // one from coming back to the foreground is still out — and PostgREST makes
  // no promise about which answers first. So each request takes a number and
  // only the newest one is allowed to write to state: the last request issued
  // is the one that saw the most recent database, whatever order the responses
  // land in. Without this the older answer can arrive last and paint a ledger
  // that predates the write that was just saved.
  const latestRequest = useRef(0)
  // A count rather than a flag, so the first response to land does not turn the
  // spinner off while a second request is still out.
  const inFlight = useRef(0)
  // When the ledger on screen was last read, or null when there is nothing on
  // screen worth an age. A ref, not state: nothing renders from it, and a
  // render per tick of staleness would be noise.
  const loadedAt = useRef<number | null>(null)

  // Signing out has to drop the ledger, and signing back in has to show a
  // loading state rather than the previous account's figures. That reset is
  // done during render, off the change in `enabled`, rather than in an effect:
  // an effect would paint one frame of stale data first, which here means
  // somebody else's balances.
  const [lastEnabled, setLastEnabled] = useState(enabled)
  if (lastEnabled !== enabled) {
    setLastEnabled(enabled)
    setLedger(EMPTY)
    setLoaded(false)
    setLoadedOnce(false)
    setError(null)
  }

  useEffect(() => {
    // The other half of that reset, kept out of render because it touches refs:
    // anything already in flight belongs to the session that just ended, so
    // retire its number rather than let it paint the previous account's
    // figures. Cleanups run before the effects of the same commit, so the
    // reload issued for the new session takes its number after this one.
    return () => {
      latestRequest.current += 1
      loadedAt.current = null
    }
  }, [enabled])

  const reload = useCallback(async () => {
    if (!enabled) return

    const request = ++latestRequest.current
    inFlight.current += 1
    setRefreshing(true)
    try {
      const next = await fetchLedger()
      if (request !== latestRequest.current) return
      setLedger(next)
      setError(null)
      setLoadedOnce(true)
      loadedAt.current = Date.now()
    } catch (caught) {
      if (request !== latestRequest.current) return
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      inFlight.current -= 1
      if (inFlight.current === 0) setRefreshing(false)
      if (request === latestRequest.current) setLoaded(true)
    }
  }, [enabled])

  /**
   * The reload that returning to the app asks for: a no-op unless the figures
   * on screen have had time to go stale, and never a second request while one
   * is already out. A failed read leaves `loadedAt` unset, so an app returned
   * to after a dropped connection tries again rather than waiting out the
   * window.
   */
  const reloadIfStale = useCallback(async () => {
    if (!enabled || inFlight.current > 0) return
    if (
      loadedAt.current !== null &&
      Date.now() - loadedAt.current < STALE_AFTER_MS
    )
      return

    await reload()
  }, [enabled, reload])

  useEffect(() => {
    if (!enabled) return

    // `visibilitychange`, not `blur`/`focus`: the question is whether the app
    // is being looked at, not whether a window has keyboard focus. On iOS —
    // where this is installed — backgrounding and returning is exactly a
    // visibility change, while `focus` also fires for things that are not a
    // return to the app at all, like dismissing a system keyboard.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void reloadIfStale()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [enabled, reloadIfStale])

  useEffect(() => {
    // Fetching on mount is the case the rule's own guidance carves out —
    // synchronising React with an external system — and there is nothing to
    // derive during render because the data is not here yet. What trips the
    // rule is `reload` flipping `refreshing` before its first await, which is
    // deliberate: the spinner belongs to the request, not to the render after
    // it lands.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload()
  }, [reload])

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action()
      } catch (caught) {
        return caught instanceof Error ? caught.message : String(caught)
      }

      await reload()
      return null
    },
    [reload],
  )

  return {
    ledger,
    loading: enabled && !loaded,
    loadedOnce,
    refreshing,
    error,
    reload,
    run,
  }
}
