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
 * Writing through covers every change the browser makes, which used to be all
 * of them. It is not all of them once something else writes to the database —
 * the bank sync, or the other person in the household on their own phone — and
 * a tab left open overnight would sit on figures nobody had contradicted. So
 * the ledger is also reloaded when the app comes back to the foreground, which
 * on an installed PWA is what opening it means.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLedger, type Ledger } from './api'

const EMPTY: Ledger = {
  accounts: [],
  budgets: [],
  transactions: [],
  imported: [],
  expressions: [],
}

/**
 * How old the ledger has to be before coming back to the app refetches it.
 * Without a floor, every alt-tab is a request, and a few thousand rows is not
 * a thing to ask for on the way past.
 */
const STALE_AFTER_MS = 60_000

export interface LedgerState {
  ledger: Ledger
  /** True until the first load finishes; a later refresh keeps data on screen. */
  loading: boolean
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
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setError(null)
  }

  // Which request is allowed to write to state. Reloads no longer happen one
  // at a time — a save and a return to the foreground can overlap — and two
  // requests can land in either order, so the older one's answer has to be
  // dropped rather than applied on top of the newer one. Applying it would put
  // a balance on screen that was right a moment ago and is now quietly wrong,
  // which is the failure the read-through model exists to prevent.
  const currentRequest = useRef(0)
  const inFlight = useRef(false)
  const loadedAt = useRef(0)

  const load = useCallback(
    async (background: boolean) => {
      if (!enabled) return

      const request = currentRequest.current + 1
      currentRequest.current = request
      inFlight.current = true
      // A refetch nobody asked for does not light up the header's progress
      // indicator; coming back to the app would blink it every time.
      if (!background) setRefreshing(true)

      try {
        const next = await fetchLedger()
        if (request !== currentRequest.current) return

        setLedger(next)
        setError(null)
        loadedAt.current = Date.now()
      } catch (caught) {
        if (request !== currentRequest.current) return

        setError(caught instanceof Error ? caught.message : String(caught))
        // `loadedAt` is deliberately left alone: a load that failed is not one
        // the staleness floor should count, so the next time the app comes
        // forward it tries again instead of waiting out the minute.
      } finally {
        // A superseded request cleans nothing up — the one that replaced it
        // owns the flags now, and clearing them here would let a third start
        // while the second is still out.
        if (request === currentRequest.current) {
          inFlight.current = false
          if (!background) setRefreshing(false)
          setLoaded(true)
        }
      }
    },
    [enabled],
  )

  const reload = useCallback(() => load(false), [load])

  useEffect(() => {
    // Fetching on mount is the case the rule's own guidance carves out —
    // synchronising React with an external system — and there is nothing to
    // derive during render because the data is not here yet. What trips the
    // rule is `load` flipping `refreshing` before its first await, which is
    // deliberate: the spinner belongs to the request, not to the render after
    // it lands.
    // oxlint-disable-next-line react/set-state-in-effect
    void load(false)

    // Signing out while a read is in flight would otherwise let the previous
    // session's ledger land in an app that is no longer showing it.
    return () => {
      currentRequest.current += 1
      inFlight.current = false
    }
  }, [load])

  useEffect(() => {
    if (!enabled) return

    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (inFlight.current) return
      if (Date.now() - loadedAt.current < STALE_AFTER_MS) return

      void load(true)
    }

    // Two events, because neither covers the other: `visibilitychange` is what
    // fires for a tab brought forward or a PWA resumed from the background,
    // and `focus` is what fires for a desktop window raised over another app
    // without the page ever having been hidden.
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)

    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [enabled, load])

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action()
      } catch (caught) {
        return caught instanceof Error ? caught.message : String(caught)
      }

      await load(false)
      return null
    },
    [load],
  )

  return {
    ledger,
    loading: enabled && !loaded,
    refreshing,
    error,
    reload,
    run,
  }
}
