import { useSyncExternalStore } from 'react'
import { isPwaUpdateReady, subscribeToPwaUpdate } from './pwaUpdate'

/**
 * `true` once a new version of the app has installed and is waiting. The
 * server snapshot is `false`: there is no service worker during any
 * pre-render, and the app is client-only in any case.
 */
export function usePwaUpdate() {
  return useSyncExternalStore(
    subscribeToPwaUpdate,
    isPwaUpdateReady,
    () => false,
  )
}
