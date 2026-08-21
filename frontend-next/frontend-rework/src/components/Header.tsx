import { useState } from 'react'
import type { Mode } from '@/engine/types'
import { useTheme, pickTheme } from '@/theme'
import { navigate } from '@/router'
import { HamburgerIcon, RestartIcon } from './icons'

interface HeaderProps {
  mode: Mode
  onNewGame: () => void
  tutorialDone: boolean
}

export function Header({ mode, onNewGame, tutorialDone }: HeaderProps) {
  const { uiTheme } = useTheme()
  const [open, setOpen] = useState(false)

  const items: { label: string; route: '/' | '/classic' | '/plus' | '/tutorial' }[] = [
    { label: 'Standard', route: '/' },
    { label: 'Classic', route: '/classic' },
    ...(tutorialDone ? [] : [{ label: 'Tutorial', route: '/tutorial' as const }]),
    { label: 'Plus', route: '/plus' },
  ]

  return (
    <header className="px-2">
      <div className="header-grid grid">
        <div className="col-[left] row-[first] flex items-center gap-4">
          <button
            className="relative"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
          >
            <HamburgerIcon className="size-7 text-tan" />
          </button>
        </div>

        <div className="col-[center] row-[first] flex items-center justify-center gap-2 text-3xl font-bold text-64-red sm:text-5xl">
          <span>2048</span>
          {mode === 'classic' && (
            <span className="bg-leather ml-1 rounded-md px-1 py-0.5 text-xs font-medium uppercase text-white">
              Classic
            </span>
          )}
        </div>

        <div className="col-[right] row-[first] flex items-center justify-end gap-4">
          <a
            href="mailto:feedback@play2048.co"
            className="text-tan hidden text-sm text-nowrap hover:underline xl:block"
          >
            Feedback
          </a>
          <button
            onClick={onNewGame}
            className="flex aspect-square items-center justify-center"
            aria-label="New game"
          >
            <RestartIcon className="size-7" />
          </button>
        </div>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <nav
            className={pickTheme(uiTheme, {
              light: 'bg-beige absolute top-8 right-2 left-2 z-40 mt-2 flex flex-col rounded-xl shadow-xl',
              plus: 'bg-dark-grey absolute top-8 right-2 left-2 z-40 mt-2 flex flex-col rounded-xl shadow-xl',
              midnight: 'bg-midnight-raised absolute top-8 right-2 left-2 z-40 mt-2 flex flex-col rounded-xl shadow-xl md:top-14 md:right-auto md:left-0 md:w-80',
            })}
          >
            {items.map((item) => (
              <button
                key={item.route}
                onClick={() => {
                  setOpen(false)
                  navigate(item.route)
                }}
                className="px-4 py-3 text-left text-sm font-medium"
              >
                {item.label}
              </button>
            ))}
            <div className="border-leather/50 mx-2 border-t" />
            <button
              onClick={() => {
                setOpen(false)
                navigate('/about')
              }}
              className="px-4 py-3 text-left text-sm font-medium"
            >
              About
            </button>
            <button
              onClick={() => {
                setOpen(false)
                navigate('/troubleshooting')
              }}
              className="px-4 py-3 text-left text-sm font-medium"
            >
              Troubleshooting
            </button>
          </nav>
        </>
      )}
    </header>
  )
}
