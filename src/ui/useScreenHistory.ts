import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { HOME, VIEWS, type Screen } from './navigation'

/**
 * What one browser history entry holds. The URL never changes — the screen
 * lives here, in `history.state`, so back and forward work without the app
 * growing addresses that a relaunch or a bookmark could land on.
 */
export interface Entry {
  screen: Screen
  /** How many of this app's entries are behind this one. */
  depth: number
  /** Where the page was scrolled when it was left, to return to on back. */
  scrollY: number
  /** Whether the drawer is open: its own entry, so back closes it. */
  menu: boolean
}

const START: Entry = { screen: HOME, depth: 0, scrollY: 0, menu: false }

const VIEW_KEYS: ReadonlySet<string> = new Set([
  ...VIEWS.map((entry) => entry.key),
  'editTransaction',
])

/**
 * An entry read back from `history.state`, or `null` if the value is not one
 * this app wrote. The state outlives the bundle that wrote it — a reload after
 * an update reads the previous version's entries — so it is checked rather
 * than trusted.
 */
export function readEntry(value: unknown): Entry | null {
  if (typeof value !== 'object' || value === null) return null
  const { screen, depth, scrollY, menu } = value as Record<string, unknown>
  if (typeof screen !== 'object' || screen === null) return null

  const { view, budgetId, transactionId } = screen as Record<string, unknown>
  if (typeof view !== 'string' || !VIEW_KEYS.has(view)) return null
  if (budgetId !== undefined && typeof budgetId !== 'string') return null
  if (view === 'editTransaction' && typeof transactionId !== 'string') {
    return null
  }

  return {
    screen: screen as Screen,
    depth: typeof depth === 'number' && depth >= 0 ? depth : 0,
    scrollY: typeof scrollY === 'number' ? scrollY : 0,
    menu: menu === true,
  }
}

function sameScreen(a: Screen, b: Screen): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * The current screen and the drawer, kept in step with the browser's history
 * so back and forward move between screens.
 *
 * A fresh launch has no history state and starts at `HOME`, which is what an
 * installed PWA relaunching should do. A reload in the same tab keeps its
 * state and stays where it was, so the entries behind it still make sense.
 */
export function useScreenHistory() {
  const [entry, setEntry] = useState<Entry>(() => {
    const restored = readEntry(window.history.state)
    // A drawer left open across a reload comes back closed.
    return restored ? { ...restored, menu: false } : START
  })

  // The entry history is on now, for the callbacks below — which can run
  // before React has rendered the last change.
  const current = useRef(entry)
  const pendingScroll = useRef<number | null>(null)
  const closing = useRef(false)

  const commit = (next: Entry, how: 'push' | 'replace') => {
    current.current = next
    if (how === 'push') window.history.pushState(next, '')
    else window.history.replaceState(next, '')
    setEntry(next)
  }

  /** Records the scroll position on the entry being left, for back. */
  const rememberScroll = () => {
    window.history.replaceState(
      { ...current.current, scrollY: window.scrollY },
      '',
    )
  }

  useEffect(() => {
    // The browser's own restoration runs before the screen it is restoring
    // has rendered, so it is done here instead.
    window.history.scrollRestoration = 'manual'
    window.history.replaceState(current.current, '')

    const onPop = (event: PopStateEvent) => {
      const next = readEntry(event.state) ?? START
      closing.current = false
      current.current = next
      pendingScroll.current = next.scrollY
      setEntry(next)
    }

    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useLayoutEffect(() => {
    if (pendingScroll.current === null) return
    window.scrollTo({ top: pendingScroll.current })
    pendingScroll.current = null
  }, [entry])

  const closeMenu = () => {
    if (!current.current.menu || closing.current) return
    // Back is asynchronous, and a second one before the first lands would
    // leave the screen behind as well as the drawer.
    closing.current = true
    window.history.back()
  }

  const openMenu = () => {
    if (current.current.menu) return
    rememberScroll()
    commit(
      { ...current.current, depth: current.current.depth + 1, menu: true },
      'push',
    )
  }

  /**
   * Moves to a screen. `replace` is for a screen that supersedes the one it
   * came from — the list a save lands on, a different filter of the same
   * list — where back to the old one would be a step backwards in time.
   */
  const go = (screen: Screen, { replace = false } = {}) => {
    const from = current.current

    if (from.menu) {
      // Chosen from the drawer: the destination takes the drawer's entry, so
      // back goes to the screen the drawer was opened over, not to the drawer.
      if (sameScreen(screen, from.screen)) return closeMenu()
      commit({ screen, depth: from.depth, scrollY: 0, menu: false }, 'replace')
    } else if (replace || sameScreen(screen, from.screen)) {
      commit({ screen, depth: from.depth, scrollY: 0, menu: false }, 'replace')
    } else {
      rememberScroll()
      commit({ screen, depth: from.depth + 1, scrollY: 0, menu: false }, 'push')
    }

    // Every screen change is a fresh page as far as the reader is concerned,
    // and without this an editor opened from halfway down a long list starts
    // halfway down itself.
    window.scrollTo({ top: 0 })
  }

  /**
   * Leaves a screen the way it was reached — back to the list, its filter and
   * its scroll position — or, with nothing of this app's behind it, replaces
   * it with `fallback` rather than leaving the app.
   */
  const goBack = (fallback: Screen) => {
    if (current.current.depth > 0) window.history.back()
    else go(fallback, { replace: true })
  }

  return {
    screen: entry.screen,
    menuOpened: entry.menu,
    go,
    goBack,
    openMenu,
    closeMenu,
  }
}
