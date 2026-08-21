import type { ReactNode } from 'react'
import { useTheme, pickTheme } from '@/theme'
import { CloseIcon } from './icons'

interface ModalProps {
  title: string
  children?: ReactNode
  actions?: ReactNode
  onClose?: () => void
  showClose?: boolean
}

/** Dialog window + overlay (spec §17). */
export function Modal({ title, children, actions, onClose, showClose }: ModalProps) {
  const { uiTheme } = useTheme()
  return (
    <div
      className={pickTheme(uiTheme, {
        light: 'fixed inset-0 z-50 bg-near-black/70',
        plus: 'fixed inset-0 z-50 bg-black/80',
        midnight: 'fixed inset-0 z-50 bg-black/85',
      })}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          className={pickTheme(uiTheme, {
            light: 'bg-sand relative my-4 flex max-h-[85vh] w-[90vw] max-w-[450px] flex-col overflow-hidden rounded-3xl shadow-xl',
            plus: 'bg-dark-grey relative my-4 flex max-h-[85vh] w-[90vw] max-w-[450px] flex-col overflow-hidden rounded-3xl shadow-xl',
            midnight: 'bg-midnight-surface relative my-4 flex max-h-[85vh] w-[90vw] max-w-[450px] flex-col overflow-hidden rounded-3xl shadow-xl',
          })}
        >
          {showClose && onClose && (
            <button
              className={pickTheme(uiTheme, {
                light: 'bg-near-black absolute right-0 top-0 flex h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full text-white',
                plus: 'bg-near-black absolute right-0 top-0 flex h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full text-white',
                midnight: 'bg-midnight-void absolute right-0 top-0 flex h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full text-white',
              })}
              onClick={onClose}
              aria-label="Close"
            >
              <CloseIcon className="size-3" />
            </button>
          )}
          <div className="p-6 text-center md:p-8">
            <div className="flex flex-col gap-6 overflow-y-auto">
              <h2 className="text-3xl font-bold">{title}</h2>
              <div className="flex flex-col gap-2 text-sm">{children}</div>
              {actions && <div className="flex flex-col gap-3">{actions}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PrimaryButton({ children, onClick, destructive }: { children: ReactNode; onClick: () => void; destructive?: boolean }) {
  const { uiTheme } = useTheme()
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg px-4 py-3 font-bold text-white shadow-button ${
        destructive ? 'text-64-red' : ''
      } ${pickTheme(uiTheme, {
        light: 'bg-gradient-to-b from-[#998C7E] to-[#988776]',
        plus: 'bg-gradient-to-b from-[#756452] to-[#6B665B]',
        midnight: 'bg-gradient-to-b from-[#2B2A27] to-[#232220]',
      })}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const { uiTheme } = useTheme()
  return (
    <button
      onClick={onClick}
      className={pickTheme(uiTheme, {
        light: 'border-tan text-brown w-full rounded-lg border-2 bg-transparent px-4 py-3 font-bold',
        plus: 'border-[#7B7465] text-sand w-full rounded-lg border-2 bg-transparent px-4 py-3 font-bold',
        midnight: 'border-[#3A3835] text-midnight-sand w-full rounded-lg border-2 bg-transparent px-4 py-3 font-bold',
      })}
    >
      {children}
    </button>
  )
}
