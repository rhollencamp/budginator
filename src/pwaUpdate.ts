import { registerSW } from 'virtual:pwa-register'

/**
 * Service worker registration and the "an update is waiting" signal.
 *
 * `registerType: 'prompt'` (see vite.config.ts) means a new worker installs
 * but then waits instead of taking over, so nobody is reloaded in the middle
 * of entering a transaction. This module holds the waiting state outside React — the
 * registration happens once at startup in `main.tsx`, before any component
 * mounts — and `usePwaUpdate.ts` subscribes the UI to it.
 */

let updateReady = false
let reloadWithUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined
const listeners = new Set<() => void>()

function setUpdateReady(ready: boolean) {
  if (updateReady === ready) return
  updateReady = ready
  for (const listener of listeners) listener()
}

/**
 * Registers the service worker and checks for a new version every time the
 * app is opened or brought back to the foreground.
 */
export function registerPwaUpdates() {
  let registration: ServiceWorkerRegistration | undefined

  reloadWithUpdate = registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg
    },
    onNeedRefresh() {
      setUpdateReady(true)
    },
  })

  const checkForUpdate = () => {
    registration?.update().catch(() => {
      // Ignore network errors; the app keeps running on the current version.
    })
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate()
  })
}

/** Whether a new version has installed and is waiting to take over. */
export function isPwaUpdateReady() {
  return updateReady
}

/** Subscribes to changes in {@link isPwaUpdateReady}; returns an unsubscribe. */
export function subscribeToPwaUpdate(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Tells the waiting worker to take over and reloads the page onto the new
 * version. The reload is the plugin's own — it waits for `controllerchange`
 * so the reload lands on the new assets rather than racing them.
 */
export function applyPwaUpdate() {
  setUpdateReady(false)
  return reloadWithUpdate?.(true) ?? Promise.resolve()
}
