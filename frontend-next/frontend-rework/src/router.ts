/**
 * Path-based SPA router (spec §1.4). Manages history state; unknown routes
 * fall back to `/`.
 */

import { useSyncExternalStore } from 'react'

export type Route =
  | '/'
  | '/classic'
  | '/plus'
  | '/tutorial'
  | '/privacy-policy'
  | '/about'
  | '/troubleshooting'

const KNOWN: Route[] = ['/', '/classic', '/plus', '/tutorial', '/privacy-policy', '/about', '/troubleshooting']

function currentPath(): Route {
  const p = window.location.pathname || '/'
  if (KNOWN.includes(p as Route)) return p as Route
  return '/'
}

let path: Route = currentPath()
const listeners = new Set<() => void>()

function emit() {
  path = currentPath()
  for (const l of listeners) l()
}

window.addEventListener('popstate', emit)

export function navigate(to: Route) {
  if (to === path) return
  window.history.pushState(null, '', to)
  emit()
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => path,
  )
}

export { path as currentRoute }
