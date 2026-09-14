/**
 * The data layer is otherwise verified by running the app. This hook is the
 * second exception, for the same reason as `api.test.ts`: it decides on its own
 * whether to repeat a request, and which of two answers in flight is allowed to
 * reach the screen. Getting the first wrong means a re-read on every glance
 * away from the app; getting the second wrong means the ledger quietly rolling
 * back to what it was before the write that was just saved.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STALE_AFTER_MS, useLedger } from './useLedger'
import type { Ledger } from './api'

vi.mock('./api', () => ({ fetchLedger: vi.fn() }))

const { fetchLedger } = await import('./api')
const read = vi.mocked(fetchLedger)

/** A ledger distinguishable from the empty one, tagged so reads can be told apart. */
function ledgerWith(name: string): Ledger {
  return {
    accounts: [{ id: name, name, multiplier: 1 }],
    budgets: [],
    transactions: [],
    imported: [],
    expressions: [],
  }
}

/** Brings the app back to the foreground. */
function returnToApp() {
  document.dispatchEvent(new Event('visibilitychange'))
}

function setNow(ms: number) {
  vi.spyOn(Date, 'now').mockReturnValue(ms)
}

afterEach(() => {
  vi.restoreAllMocks()
  read.mockReset()
})

async function mounted() {
  setNow(0)
  read.mockResolvedValue(ledgerWith('first'))

  const view = renderHook(() => useLedger(true))
  await waitFor(() => expect(view.result.current.loadedOnce).toBe(true))
  expect(read).toHaveBeenCalledTimes(1)

  return view
}

describe('useLedger', () => {
  it('reads once on mount', async () => {
    const { result } = await mounted()

    expect(result.current.ledger.accounts[0]?.name).toBe('first')
  })

  it('does not read again when the app is returned to while the ledger is fresh', async () => {
    await mounted()

    setNow(STALE_AFTER_MS - 1)
    await act(async () => {
      returnToApp()
    })

    expect(read).toHaveBeenCalledTimes(1)
  })

  it('reads again when the app is returned to after the ledger has gone stale', async () => {
    const { result } = await mounted()

    read.mockResolvedValue(ledgerWith('second'))
    setNow(STALE_AFTER_MS)
    await act(async () => {
      returnToApp()
    })

    expect(read).toHaveBeenCalledTimes(2)
    await waitFor(() =>
      expect(result.current.ledger.accounts[0]?.name).toBe('second'),
    )
  })

  it('does not stack a second read on a return while one is already in flight', async () => {
    const { result } = await mounted()

    let land = () => {}
    read.mockReturnValue(
      new Promise<Ledger>((resolve) => {
        land = () => resolve(ledgerWith('second'))
      }),
    )

    setNow(STALE_AFTER_MS)
    await act(async () => {
      returnToApp()
    })
    expect(read).toHaveBeenCalledTimes(2)

    // Backgrounded and returned to again before the first answer arrives.
    await act(async () => {
      returnToApp()
    })
    expect(read).toHaveBeenCalledTimes(2)

    await act(async () => {
      land()
    })
    expect(result.current.ledger.accounts[0]?.name).toBe('second')
    expect(result.current.refreshing).toBe(false)
  })

  it('ignores an answer overtaken by a later request', async () => {
    const { result } = await mounted()

    // The return-to-app read goes out first and comes back last.
    let landStale = () => {}
    read.mockReturnValueOnce(
      new Promise<Ledger>((resolve) => {
        landStale = () => resolve(ledgerWith('stale'))
      }),
    )
    setNow(STALE_AFTER_MS)
    await act(async () => {
      returnToApp()
    })

    // A write's reload is issued while it is still out, and lands first.
    read.mockResolvedValue(ledgerWith('saved'))
    await act(async () => {
      await result.current.run(async () => {})
    })
    expect(result.current.ledger.accounts[0]?.name).toBe('saved')

    await act(async () => {
      landStale()
    })
    expect(result.current.ledger.accounts[0]?.name).toBe('saved')
  })

  it('tries again on a return after a failed read, however recent', async () => {
    setNow(0)
    read.mockRejectedValue(new Error('Could not load budgets: offline'))

    const { result } = renderHook(() => useLedger(true))
    await waitFor(() => expect(result.current.error).not.toBeNull())

    read.mockResolvedValue(ledgerWith('recovered'))
    await act(async () => {
      returnToApp()
    })

    expect(read).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(result.current.error).toBeNull())
  })
})
