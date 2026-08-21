/**
 * Theme resolution (spec §3.2): Midnight > Plus > Light.
 * `midnightTheme` is a global persisted boolean (spec §3.3 / §39).
 */

import { createContext, useContext } from 'react'
import type { BoardTheme } from '@/render/textures'
import { loadMidnightTheme, saveMidnightTheme } from '@/persistence/storage'

export type UiTheme = 'light' | 'plus' | 'midnight'

export function resolveTheme(routeMode: 'standard' | 'classic' | 'plus', midnight: boolean): UiTheme {
  if (midnight) return 'midnight'
  if (routeMode === 'plus') return 'plus'
  return 'light'
}

export function boardThemeFor(ui: UiTheme): BoardTheme {
  return ui
}

export interface ThemeContextValue {
  midnight: boolean
  uiTheme: UiTheme
  boardTheme: BoardTheme
  setMidnight: (on: boolean) => void
}

export const ThemeContext = createContext<ThemeContextValue>({
  midnight: false,
  uiTheme: 'light',
  boardTheme: 'light',
  setMidnight: () => {},
})

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

export { loadMidnightTheme, saveMidnightTheme }

/** Per-theme Tailwind class map helper. */
export interface ThemedClasses {
  light: string
  plus: string
  midnight: string
}

export function pickTheme(ui: UiTheme, m: ThemedClasses): string {
  return m[ui]
}
