import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * The commit this bundle was built from, baked in as `__GIT_SHA__` so the
 * running app can say which build it is. CI checks out shallowly but still has
 * a `.git`, so `rev-parse` works there; `GITHUB_SHA` is the fallback for a
 * build with no repository at all (a tarball, a Docker layer), and 'unknown'
 * the last resort — this must never fail a build.
 */
function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) ?? 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative, so the built bundle works wherever it is served from — the root
  // of a domain, a project subpath on GitHub Pages, or a local `vite preview`.
  // The manifest below still needs absolute-ish values, which is why
  // `start_url` and `scope` are '.' rather than a path.
  base: './',
  define: {
    // Kept in step with the same define in `vitest.config.ts`, which stands in
    // for this one because Vitest does not read this config.
    __GIT_SHA__: JSON.stringify(gitSha()),
  },
  plugins: [
    react(),
    VitePWA({
      // A new worker installs and then waits, so nobody is reloaded in the
      // middle of entering a transaction; the drawer offers the update.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Budginator',
        short_name: 'Budginator',
        description:
          'Envelope budgeting: track spending by hand, import it from the bank, and split it across budgets.',
        theme_color: '#0f6b4a',
        background_color: '#f3f6f4',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Everything this app reads lives behind an authenticated Supabase
        // call, and a cached ledger is a ledger that can be wrong without
        // saying so. The service worker caches the shell — so the app opens
        // instantly and offline — and nothing else; the data is fetched fresh
        // on every launch, or the screen says it could not be.
        navigateFallbackDenylist: [/^\/auth\//],
      },
    }),
  ],
})
