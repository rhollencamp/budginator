import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLedger } from './useLedger'
import { fetchLedger } from './api'
import type { Ledger } from './api'

vi.mock('./api', () => ({ fetchLedger: vi.fn() }))

const reads = vi.mocked(fetchLedger)

/** A ledger with one recognisable budget, so a test can say which load won. */
function ledgerNamed(name: string): Ledger {
  return {
    accounts: [],
    budgets: [{ id: name, name, icon: '', amountCents: 0, startDate: today }],
    transactions: [],
    imported: [],
    expressions: [],
  }
}

const today = '2024-03-05'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** The name of the budget currently on screen, or null for an empty ledger. */
function shown(ledger: Ledger): string | null {
  return ledger.budgets[0]?.name ?? null
}

// The clock is the hook's staleness floor, so tests move it rather than wait.
const START = 1_700_000_000_000
let now = START

function elapse(ms: number) {
  now += ms
}

function comeBackToTheApp() {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

function raiseTheWindow() {
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
}

beforeEach(() => {
  now = START
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  reads.mockReset()
  reads.mockResolvedValue(ledgerNamed('first'))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useLedger', () => {
  it('loads once on mount', async () => {
    const { result } = renderHook(() => useLedger(true))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(shown(result.current.ledger)).toBe('first')
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it('does not read at all while signed out', async () => {
    const { result } = renderHook(() => useLedger(false))

    comeBackToTheApp()

    expect(reads).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('reloads after a write, and reports a failed one without reloading', async () => {
    const { result } = renderHook(() => useLedger(true))
    await waitFor(() => expect(result.current.loading).toBe(false))

    reads.mockResolvedValue(ledgerNamed('after the write'))
    let message: string | null = 'unset'
    await act(async () => {
      message = await result.current.run(async () => undefined)
    })

    expect(message).toBeNull()
    expect(shown(result.current.ledger)).toBe('after the write')
    expect(reads).toHaveBeenCalledTimes(2)

    await act(async () => {
      message = await result.current.run(async () => {
        throw new Error('splits do not balance')
      })
    })

    expect(message).toBe('splits do not balance')
    expect(reads).toHaveBeenCalledTimes(2)
  })

  describe('coming back to the app', () => {
    it('refetches once the ledger is stale', async () => {
      const { result } = renderHook(() => useLedger(true))
      await waitFor(() => expect(result.current.loading).toBe(false))

      reads.mockResolvedValue(ledgerNamed('synced overnight'))
      elapse(8 * 60 * 60 * 1000)
      comeBackToTheApp()

      await waitFor(() =>
        expect(shown(result.current.ledger)).toBe('synced overnight'),
      )
      expect(reads).toHaveBeenCalledTimes(2)
    })

    it('refetches on a window focus too', async () => {
      const { result } = renderHook(() => useLedger(true))
      await waitFor(() => expect(result.current.loading).toBe(false))

      elapse(2 * 60 * 1000)
      raiseTheWindow()

      await waitFor(() => expect(reads).toHaveBeenCalledTimes(2))
    })

    it('leaves a ledger read a moment ago alone', async () => {
      const { result } = renderHook(() => useLedger(true))
      await waitFor(() => expect(result.current.loading).toBe(false))

      elapse(30 * 1000)
      comeBackToTheApp()
      raiseTheWindow()

      expect(reads).toHaveBeenCalledTimes(1)
    })

    it('does not start a second read while one is in flight', async () => {
      const first = deferred<Ledger>()
      reads.mockReturnValueOnce(first.promise)
      renderHook(() => useLedger(true))

      elapse(8 * 60 * 60 * 1000)
      comeBackToTheApp()
      comeBackToTheApp()

      expect(reads).toHaveBeenCalledTimes(1)

      await act(async () => {
        first.resolve(ledgerNamed('first'))
      })
      expect(reads).toHaveBeenCalledTimes(1)
    })

    it('stays quiet: a background refetch does not light the indicator', async () => {
      const { result } = renderHook(() => useLedger(true))
      await waitFor(() => expect(result.current.loading).toBe(false))

      const later = deferred<Ledger>()
      reads.mockReturnValueOnce(later.promise)
      elapse(8 * 60 * 60 * 1000)
      comeBackToTheApp()

      expect(result.current.refreshing).toBe(false)

      await act(async () => {
        later.resolve(ledgerNamed('quietly updated'))
      })
      expect(shown(result.current.ledger)).toBe('quietly updated')
    })

    it('tries again next time when the refetch failed', async () => {
      const { result } = renderHook(() => useLedger(true))
      await waitFor(() => expect(result.current.loading).toBe(false))

      reads.mockRejectedValueOnce(new Error('offline'))
      elapse(8 * 60 * 60 * 1000)
      comeBackToTheApp()
      await waitFor(() => expect(result.current.error).toBe('offline'))

      // No time has passed, but a failed read is not a fresh one.
      reads.mockResolvedValue(ledgerNamed('back online'))
      comeBackToTheApp()

      await waitFor(() =>
        expect(shown(result.current.ledger)).toBe('back online'),
      )
      expect(result.current.error).toBeNull()
    })
  })

  describe('when two reads overlap', () => {
    it('keeps the newer answer when the older one lands last', async () => {
      const slow = deferred<Ledger>()
      const quick = deferred<Ledger>()
      reads.mockReturnValueOnce(slow.promise).mockReturnValueOnce(quick.promise)

      const { result } = renderHook(() => useLedger(true))
      act(() => {
        void result.current.reload()
      })

      await act(async () => {
        quick.resolve(ledgerNamed('newer'))
      })
      expect(shown(result.current.ledger)).toBe('newer')

      await act(async () => {
        slow.resolve(ledgerNamed('older'))
      })
      expect(shown(result.current.ledger)).toBe('newer')
    })

    it('ignores an older read that fails after a newer one succeeded', async () => {
      const slow = deferred<Ledger>()
      const quick = deferred<Ledger>()
      reads.mockReturnValueOnce(slow.promise).mockReturnValueOnce(quick.promise)

      const { result } = renderHook(() => useLedger(true))
      act(() => {
        void result.current.reload()
      })

      await act(async () => {
        quick.resolve(ledgerNamed('newer'))
      })
      await act(async () => {
        slow.reject(new Error('timed out'))
      })

      expect(result.current.error).toBeNull()
      expect(shown(result.current.ledger)).toBe('newer')
    })
  })

  it('drops a read still in flight when the session ends', async () => {
    const pending = deferred<Ledger>()
    reads.mockReturnValueOnce(pending.promise)

    const { result, rerender } = renderHook(
      ({ signedIn }) => useLedger(signedIn),
      { initialProps: { signedIn: true } },
    )

    rerender({ signedIn: false })

    await act(async () => {
      pending.resolve(ledgerNamed('the previous session'))
    })

    expect(shown(result.current.ledger)).toBeNull()
  })
})
