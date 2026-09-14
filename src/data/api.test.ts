/**
 * The data layer is otherwise verified by running the app — it is a mapping
 * onto PostgREST and a fake of that proves nothing. The retry policy is the
 * exception: it decides on its own whether a failure is worth repeating, and
 * getting that wrong either leaves a cold start showing an error that would
 * have cleared itself, or repeats a request that was never going to work.
 */
import { describe, expect, it, vi } from 'vitest'
import { retryTransient } from './api'

/** No waiting in the test; the delays themselves are not what is under test. */
const NOW = [0, 0, 0]

describe('retryTransient', () => {
  it('returns the first answer when there is nothing wrong', async () => {
    const read = vi.fn().mockResolvedValue('ledger')

    await expect(retryTransient(read, NOW)).resolves.toBe('ledger')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('asks again when the token was issued a moment into the future', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('Could not load budgets: JWT issued at future'),
      )
      .mockResolvedValue('ledger')

    await expect(retryTransient(read, NOW)).resolves.toBe('ledger')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('asks again while a token is not yet valid', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('JWT not yet valid'))
      .mockRejectedValueOnce(new Error('JWT not yet valid'))
      .mockResolvedValue('ledger')

    await expect(retryTransient(read, NOW)).resolves.toBe('ledger')
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('gives up after the last delay, with the error it last saw', async () => {
    const read = vi.fn().mockRejectedValue(new Error('JWT issued at future'))

    await expect(retryTransient(read, NOW)).rejects.toThrow(
      'JWT issued at future',
    )
    // One attempt per delay, plus the first.
    expect(read).toHaveBeenCalledTimes(NOW.length + 1)
  })

  it('does not repeat a request that failed on its merits', async () => {
    const read = vi
      .fn()
      .mockRejectedValue(new Error('Could not load budgets: JWT expired'))

    await expect(retryTransient(read, NOW)).rejects.toThrow('JWT expired')
    expect(read).toHaveBeenCalledTimes(1)
  })
})
