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
 */
import { useCallback, useEffect, useState } from 'react'
import { fetchLedger, type Ledger } from './api'

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

  const reload = useCallback(async () => {
    if (!enabled) return

    setRefreshing(true)
    try {
      setLedger(await fetchLedger())
      setError(null)
      setLoadedOnce(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRefreshing(false)
      setLoaded(true)
    }
  }, [enabled])

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
