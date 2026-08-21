import type { Mode, PowerupId, PowerupInventory } from '@/engine/types'
import { useTheme, pickTheme } from '@/theme'
import { POWERUP_ICONS, CloseIcon } from './icons'

const LABELS: Record<PowerupId, string> = {
  undo: 'Undo',
  swap: 'Swap Two Tiles',
  remove: 'Remove by Value',
  teleport: 'Teleport a Tile',
  rotate: 'Rotate the Outer Ring',
  bomb: 'Bomb',
}

/** Order of powerups per mode (spec §29.1). */
const MODE_ORDER: Record<'standard' | 'plus', PowerupId[]> = {
  standard: ['undo', 'swap', 'remove'],
  plus: ['undo', 'teleport', 'swap', 'rotate', 'remove', 'bomb'],
}

interface PowerupBarProps {
  mode: Mode
  inventory: PowerupInventory
  selecting: PowerupId | null
  disabled: boolean
  onSelect: (id: PowerupId) => void
  onCancel: () => void
}

export function PowerupBar({ mode, inventory, selecting, disabled, onSelect, onCancel }: PowerupBarProps) {
  const { uiTheme } = useTheme()
  if (mode === 'classic' || mode === 'tutorial') return null

  const order = MODE_ORDER[mode === 'plus' ? 'plus' : 'standard']

  return (
    <div
      className={pickTheme(uiTheme, {
        light: 'bg-sand relative flex max-w-[calc(100vw-20px)] gap-2 rounded-xl p-2 transition-opacity sm:gap-3 xs:p-3',
        plus: 'bg-dark-grey relative flex max-w-[calc(100vw-20px)] gap-2 rounded-xl p-2 transition-opacity sm:gap-3 xs:p-3',
        midnight: 'bg-midnight-surface relative flex max-w-[calc(100vw-20px)] gap-2 rounded-xl p-2 transition-opacity sm:gap-3 xs:p-3',
      })}
    >
      {order.map((id) => {
        const slot = inventory[id]
        if (!slot) return null
        const Icon = POWERUP_ICONS[id]
        const isSelecting = selecting === id
        const isIdle = slot.usesRemaining <= 0

        const stateClass = isIdle
          ? pickTheme(uiTheme, { light: 'bg-leather', plus: 'bg-near-black', midnight: 'bg-midnight-disabled' })
          : isSelecting
            ? pickTheme(uiTheme, { light: 'bg-tan', plus: 'bg-light-grey', midnight: 'bg-midnight-active' }) + ' shadow-button'
            : pickTheme(uiTheme, { light: 'bg-leather/30', plus: 'bg-light-grey/40', midnight: 'bg-midnight-active/35' })

        return (
          <div key={id} className="group relative">
            <button
              onClick={() => (isSelecting ? onCancel() : !isIdle && onSelect(id))}
              disabled={disabled || isIdle}
              className={`relative aspect-square w-full max-w-12 shrink items-center justify-center rounded-md p-1 xs:rounded-lg xs:p-2 ${stateClass} ${
                disabled || isIdle ? 'cursor-not-allowed opacity-70' : ''
              }`}
              aria-label={LABELS[id]}
            >
              <Icon className="size-full text-white" />
              {slot.usesRemaining > 0 && (
                <span className="bg-off-white text-tan absolute right-0 bottom-0 min-w-4 translate-x-1/2 translate-y-1/2 rounded-full px-1 py-0.5 text-xs font-semibold">
                  {slot.usesRemaining}
                </span>
              )}
            </button>

            {isSelecting && (
              <button
                onClick={onCancel}
                className={pickTheme(uiTheme, {
                  light: 'bg-dark-grey absolute right-1/2 bottom-0 flex h-6 w-6 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white',
                  plus: 'bg-dark-grey absolute right-1/2 bottom-0 flex h-6 w-6 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white',
                  midnight: 'bg-midnight-void absolute right-1/2 bottom-0 flex h-6 w-6 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white',
                })}
                aria-label="Cancel"
              >
                <CloseIcon className="size-3" />
              </button>
            )}

            <div
              className={pickTheme(uiTheme, {
                light: 'bg-dark-grey absolute -top-2 z-30 hidden w-max max-w-64 -translate-y-full flex-col rounded-xl px-4 py-3 text-xs text-white opacity-0 group-hover:-top-4 group-hover:flex group-hover:opacity-100',
                plus: 'bg-dark-grey absolute -top-2 z-30 hidden w-max max-w-64 -translate-y-full flex-col rounded-xl px-4 py-3 text-xs text-white opacity-0 group-hover:-top-4 group-hover:flex group-hover:opacity-100',
                midnight: 'bg-midnight-void absolute -top-2 z-30 hidden w-max max-w-64 -translate-y-full flex-col rounded-xl px-4 py-3 text-xs text-white opacity-0 group-hover:-top-4 group-hover:flex group-hover:opacity-100',
              })}
              role="tooltip"
            >
              <span className="font-bold">{LABELS[id]}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
