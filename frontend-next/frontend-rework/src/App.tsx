import { useEffect, useMemo, useState } from 'react'
import { useRoute } from './router'
import { ThemeContext, loadMidnightTheme, resolveTheme, saveMidnightTheme } from './theme'
import { GamePage } from './components/GamePage'
import { TutorialPage } from './components/TutorialPage'
import { StaticPage } from './components/StaticPage'

function modeForRoute(route: ReturnType<typeof useRoute>): 'standard' | 'classic' | 'plus' {
  if (route === '/classic') return 'classic'
  if (route === '/plus') return 'plus'
  return 'standard'
}

export default function App() {
  const route = useRoute()
  const [midnight, setMidnight] = useState(() => loadMidnightTheme())

  useEffect(() => {
    document.documentElement.dataset.theme = midnight ? 'midnight' : route === '/plus' ? 'plus' : 'light'
  }, [midnight, route])

  const uiTheme = resolveTheme(modeForRoute(route), midnight)
  const themeValue = useMemo(
    () => ({
      midnight,
      uiTheme,
      boardTheme: uiTheme as 'light' | 'plus' | 'midnight',
      setMidnight: (on: boolean) => {
        setMidnight(on)
        saveMidnightTheme(on)
      },
    }),
    [midnight, uiTheme],
  )

  return (
    <ThemeContext.Provider value={themeValue}>
      <div className="flex min-h-[100svh] w-screen touch-none flex-col overflow-x-hidden">
        {route === '/tutorial' ? (
          <TutorialPage />
        ) : route === '/about' || route === '/privacy-policy' || route === '/troubleshooting' ? (
          <StaticPage route={route} />
        ) : (
          <GamePage mode={modeForRoute(route)} />
        )}
      </div>
    </ThemeContext.Provider>
  )
}
