/**
 * SVG assets (spec §10). Paths retained verbatim.
 */

interface IconProps {
  className?: string
}

export function HamburgerIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 16h18v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zm0-2-.621-7.452a.75.75 0 0 1 1.163-.686l3.756 2.503a.75.75 0 0 0 1.006-.16L11.41 4.25a.75.75 0 0 1 1.18 0l3.106 3.954a.75.75 0 0 0 1.006.16l3.756-2.503a.75.75 0 0 1 1.163.686L21 14z" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M480-429 316-265q-11 11-25 10.5T266-266t-11-25.5 11-25.5l163-163-164-164q-11-11-10.5-25.5T266-695t25.5-11 25.5 11l163 164 164-164q11-11 25.5-11t25.5 11 11 25.5-11 25.5L531-480l164 164q11 11 11 25t-11 25-25.5 11-25.5-11z" />
    </svg>
  )
}

export function UndoIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M10 25h6.5a8.5 8.5 0 0 0 8.5-8.5v0A8.5 8.5 0 0 0 16.5 8H8m0 0 3.5-4M8 8l3.5 4" />
    </svg>
  )
}

export function SwapIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path stroke="currentColor" strokeWidth="2" d="M18 9h.53a4 4 0 0 1 3.96 3.434L23 16m0 0 3.5-3.5M23 16l-4-2" />
      <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M16.006 25.23A4 4 0 0 0 20 29h5a4 4 0 0 0 4-4v-5a4 4 0 0 0-2.19-3.568l-1.689 1.69a3 3 0 0 1-3.463.561l-3.939-1.97A4 4 0 0 0 16 20v.764c.614.55 1 1.347 1 2.236 0 .885-.384 1.681-.994 2.23" />
      <path stroke="currentColor" strokeWidth="2" d="M14 23h-.53a4 4 0 0 1-3.96-3.434L9 16m0 0-3.5 3.5M9 16l4 2" />
      <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M3 7a4 4 0 0 1 4-4h5a4 4 0 0 1 3.993 3.77A3 3 0 0 0 15 9a3 3 0 0 0 1 2.236V12c0 1.361-.68 2.564-1.72 3.286l-3.938-1.97a3 3 0 0 0-3.463.563l-1.69 1.689A4 4 0 0 1 3 12z" />
    </svg>
  )
}

export function RemoveValueIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 26.8c-4.564-.927-8-4.962-8-9.8 0-5.523 4.477-10 10-10h3m0 0-3-4m3 4-3 4" />
      <path strokeDasharray="3 4" strokeLinecap="round" strokeWidth="2.5" d="M25.037 12.716a9.95 9.95 0 0 1 .865 5.676c-.673 4.79-4.637 8.309-9.286 8.59" />
    </svg>
  )
}

export function TeleportIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m19 13-6 6m6-6 .5 5m-.5-5-5-.5" />
      <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M20 5.5h5A1.5 1.5 0 0 1 26.5 7v5a1.5 1.5 0 0 1-1.5 1.5h-2.935l.25 2.5H25a4 4 0 0 0 4-4V7a4 4 0 0 0-4-4h-5a4 4 0 0 0-4 4v2.685l2.5.25V7A1.5 1.5 0 0 1 20 5.5M11.757 16H6.6A3.6 3.6 0 0 0 3 19.6v5.8A3.6 3.6 0 0 0 6.6 29h5.8a3.6 3.6 0 0 0 3.6-3.6v-5.157l-.879.878a3 3 0 1 1-4.242-4.242z" />
    </svg>
  )
}

export function RotateIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="12" height="12" x="15" y="15" rx="4" transform="rotate(180 15 15)" fill="currentColor" />
      <rect width="9.5" height="9.5" x="13.75" y="27.75" strokeLinecap="round" strokeWidth="2.5" rx="2.75" transform="rotate(180 13.75 27.75)" stroke="currentColor" />
      <rect width="9.5" height="9.5" x="27.75" y="13.75" strokeLinecap="round" strokeWidth="2.5" rx="2.75" transform="rotate(180 27.75 13.75)" stroke="currentColor" />
      <rect width="12" height="12" x="29" y="29" rx="4" transform="rotate(180 29 29)" fill="currentColor" />
    </svg>
  )
}

export function BombIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <path d="M22.667 10.067q-.166 0-.334-.034A1 1 0 0 1 22 9.9l-1.167-.667a1.3 1.3 0 0 0-1.016-.116 1.3 1.3 0 0 0-.817.616l-.167.267 1.334.767q.7.399.916 1.2a1.9 1.9 0 0 1-.183 1.5l-.9 1.6q.767 1.2 1.15 2.55.384 1.35.383 2.783 0 4.167-2.916 7.083T11.533 30.4 4.45 27.45t-2.917-7.117 2.884-7.05 7.05-2.883h.433l.9-1.567a1.87 1.87 0 0 1 1.2-.95 1.92 1.92 0 0 1 1.533.217l1 .567.167-.267q.767-1.434 2.4-1.867t3.067.4l1.133.634q.3.166.5.483t.2.683q0 .567-.383.95a1.3 1.3 0 0 1-.95.384m4 .333q0-.567.383-.95a1.3 1.3 0 0 1 .95-.383h1.333q.567 0 .95.383.384.383.384.95 0 .566-.384.95a1.3 1.3 0 0 1-.95.383H28a1.3 1.3 0 0 1-.95-.383 1.3 1.3 0 0 1-.383-.95m-6-6a1.3 1.3 0 0 1-.95-.383 1.3 1.3 0 0 1-.384-.95V1.733q0-.566.384-.95a1.3 1.3 0 0 1 .95-.383q.567 0 .95.383.383.384.383.95v1.334q0 .566-.383.95a1.3 1.3 0 0 1-.95.383M24.9 6.167q-.366-.367-.367-.934 0-.567.367-.933l.967-.967q.366-.366.933-.366t.933.366q.367.367.367.934 0 .565-.367.933l-.966.967q-.367.366-.934.366-.565 0-.933-.366" />
    </svg>
  )
}

export function RestartIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#e8eaed" aria-hidden="true">
      <path d="M440-800v487L216-537l-56 57 320 320 320-320-56-57-224 224v-487z" />
    </svg>
  )
}

export const POWERUP_ICONS = {
  undo: UndoIcon,
  swap: SwapIcon,
  remove: RemoveValueIcon,
  teleport: TeleportIcon,
  rotate: RotateIcon,
  bomb: BombIcon,
} as const
