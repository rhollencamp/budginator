/**
 * The hook decides which moves become history entries and which replace one,
 * and that is what back and forward do with them: getting it wrong means back
 * reopening an editor that was just saved, or the drawer, or leaving the app.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HOME } from './navigation'
import { readEntry, useScreenHistory } from './useScreenHistory'

/** Goes back one entry and waits for the hook to hear about it. */
async function back(result: { current: ReturnType<typeof useScreenHistory> }) {
  const before = result.current
  act(() => window.history.back())
  await waitFor(() => expect(result.current).not.toBe(before))
}

beforeEach(() => {
  window.scrollTo = vi.fn()
  // jsdom keeps one history for the whole file; each test starts clean at the
  // top of a fresh entry rather than on whatever the last one left.
  window.history.pushState(null, '')
})

describe('useScreenHistory', () => {
  it('starts at home on a fresh launch', () => {
    const { result } = renderHook(() => useScreenHistory())

    expect(result.current.screen).toEqual(HOME)
    expect(result.current.menuOpened).toBe(false)
  })

  it('returns to the previous screen on back', async () => {
    const { result } = renderHook(() => useScreenHistory())

    act(() => result.current.go({ view: 'setup' }))
    act(() => result.current.go({ view: 'transactions', budgetId: 'b1' }))
    expect(result.current.screen).toEqual({
      view: 'transactions',
      budgetId: 'b1',
    })

    await back(result)
    expect(result.current.screen).toEqual({ view: 'setup' })

    await back(result)
    expect(result.current.screen).toEqual(HOME)
  })

  it('replaces rather than pushes when asked to', async () => {
    const { result } = renderHook(() => useScreenHistory())

    act(() => result.current.go({ view: 'track' }))
    act(() =>
      result.current.go(
        { view: 'transactions', budgetId: 'b1' },
        { replace: true },
      ),
    )

    // Back skips the saved entry form and lands where it was opened from.
    await back(result)
    expect(result.current.screen).toEqual(HOME)
  })

  it('does not stack an entry for the screen already showing', async () => {
    const { result } = renderHook(() => useScreenHistory())

    act(() => result.current.go({ view: 'setup' }))
    act(() => result.current.go({ view: 'setup' }))

    await back(result)
    expect(result.current.screen).toEqual(HOME)
  })

  it('closes the drawer on back, leaving the screen where it was', async () => {
    const { result } = renderHook(() => useScreenHistory())

    act(() => result.current.go({ view: 'setup' }))
    act(() => result.current.openMenu())
    expect(result.current.menuOpened).toBe(true)

    await back(result)
    expect(result.current.menuOpened).toBe(false)
    expect(result.current.screen).toEqual({ view: 'setup' })
  })

  it('puts a screen chosen from the drawer in place of the drawer', async () => {
    const { result } = renderHook(() => useScreenHistory())

    act(() => result.current.openMenu())
    act(() => result.current.go({ view: 'settings' }))
    expect(result.current.menuOpened).toBe(false)
    expect(result.current.screen).toEqual({ view: 'settings' })

    // Back goes to the screen the drawer was opened over, not the drawer.
    await back(result)
    expect(result.current.screen).toEqual(HOME)
    expect(result.current.menuOpened).toBe(false)
  })

  it('closes the drawer once however often it is asked', async () => {
    const { result } = renderHook(() => useScreenHistory())

    act(() => result.current.go({ view: 'setup' }))
    act(() => result.current.openMenu())
    act(() => {
      result.current.closeMenu()
      result.current.closeMenu()
    })

    await waitFor(() => expect(result.current.menuOpened).toBe(false))
    expect(result.current.screen).toEqual({ view: 'setup' })
  })

  it('goes back to the list an editor was opened from', async () => {
    const { result } = renderHook(() => useScreenHistory())

    act(() => result.current.go({ view: 'transactions', budgetId: 'b1' }))
    act(() =>
      result.current.go({ view: 'editTransaction', transactionId: 't1' }),
    )

    act(() => result.current.goBack({ view: 'transactions' }))
    await waitFor(() =>
      expect(result.current.screen).toEqual({
        view: 'transactions',
        budgetId: 'b1',
      }),
    )
  })

  it('falls back rather than leaving the app with nothing behind', () => {
    window.history.replaceState(
      {
        screen: { view: 'editTransaction', transactionId: 't1' },
        depth: 0,
        scrollY: 0,
        menu: false,
      },
      '',
    )
    const { result } = renderHook(() => useScreenHistory())
    expect(result.current.screen.view).toBe('editTransaction')

    act(() => result.current.goBack({ view: 'transactions' }))
    expect(result.current.screen).toEqual({ view: 'transactions' })
  })

  it('restores the scroll position of the screen gone back to', async () => {
    const { result } = renderHook(() => useScreenHistory())

    act(() => result.current.go({ view: 'transactions' }))
    window.scrollY = 640
    act(() =>
      result.current.go({ view: 'editTransaction', transactionId: 't1' }),
    )
    window.scrollY = 0

    await back(result)
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 640 })
  })
})

describe('readEntry', () => {
  it('reads back what the hook writes', () => {
    const entry = {
      screen: { view: 'track', budgetId: 'b1' },
      depth: 2,
      scrollY: 10,
      menu: true,
    }
    expect(readEntry(entry)).toEqual(entry)
  })

  it.each([
    ['nothing', null],
    ['an empty object', {}],
    ['an unknown view', { screen: { view: 'reports' } }],
    ['an editor with no transaction', { screen: { view: 'editTransaction' } }],
    ['a filter that is not an id', { screen: { view: 'track', budgetId: 3 } }],
  ])('refuses %s', (_name, value) => {
    expect(readEntry(value)).toBeNull()
  })
})
