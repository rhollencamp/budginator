import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Vitest reads this config instead of `vite.config.ts`, so the build-time
  // constants defined there have to be stood in for here as well.
  define: {
    __GIT_SHA__: JSON.stringify('dev'),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
