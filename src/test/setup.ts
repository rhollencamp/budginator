/**
 * jsdom is missing a few browser APIs that Mantine reaches for on mount.
 * Stubbing them here rather than in each test keeps the tests about the
 * components.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest is not run with `globals: true`, so Testing Library's automatic
// cleanup never registers itself: without this the DOM accumulates across
// tests and every query finds the previous test's copy too.
afterEach(cleanup)

// Mantine's responsive hooks and its color-scheme manager both read this.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Used by Mantine's ScrollArea and several overlay components.
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
