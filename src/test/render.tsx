import type { ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'
import { render as testingLibraryRender } from '@testing-library/react'
import { theme } from '../theme'

/**
 * Renders inside the same provider the app uses, so component tests exercise
 * the real theme rather than Mantine's defaults.
 */
export function render(ui: ReactNode) {
  return testingLibraryRender(<>{ui}</>, {
    wrapper: ({ children }) => (
      <MantineProvider theme={theme} defaultColorScheme="light">
        {children}
      </MantineProvider>
    ),
  })
}

// Re-exported by name rather than with `export *`: a wildcard here would also
// re-export Testing Library's own `render`, which is the one thing this module
// exists to replace.
export { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
