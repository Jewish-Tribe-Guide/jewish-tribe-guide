// Small shared line icons (1.8 stroke) so UI actions read consistently instead
// of relying on emoji, which render differently across platforms. Match the
// inline-SVG style already used in SiteHeader / LocationControl.
type IconProps = { className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}

export function FlagIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  )
}

// Location pin — the header's "Set location" mark. Rendered filled once a
// location is actually set (see LocationControl) — that's the only feedback
// mobile gets that the address stuck, since the pill's text collapses down to
// just this icon there.
export function PinIcon({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base} fill={filled ? 'currentColor' : 'none'} className={className}>
      <path d="M12 21c-4.4-3.9-7-7.4-7-10.8A7 7 0 0 1 12 3a7 7 0 0 1 7 7.2c0 3.4-2.6 6.9-7 10.8z" />
      <circle cx="12" cy="10" r="2.6" {...(filled ? { fill: 'white', stroke: 'none' } : {})} />
    </svg>
  )
}

// Magen David — the app's brand mark (thinner 1.7 stroke, no linecap, so it
// renders identically everywhere rather than falling back to the ✡ emoji glyph).
// To rebrand for another community, replace this SVG (and src/app/favicon.ico).
export function StarOfDavid({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3 L19.8 16.5 L4.2 16.5 Z" />
      <path d="M12 21 L4.2 7.5 L19.8 7.5 Z" />
    </svg>
  )
}

// Outbound-link arrow, shown next to links that open an external site in a new
// tab (eruv status pages, etc.). Defaults to the small size used inline.
export function ExternalIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 5H5v10h10v-3M12 4h4v4M16 4l-7 7" />
    </svg>
  )
}

// 2x2 grid — the mobile tab bar's "Categories" tab.
export function GridIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

// Folded map — the mobile tab bar's "Map" tab.
export function MapFoldIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </svg>
  )
}

// Speech bubble — the mobile tab bar's "Feedback" tab.
export function MessageIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 5h16v11H8l-4 4V5z" />
    </svg>
  )
}

// Left chevron — the map place-detail panel's "Back to list" control.
export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

// Right chevron — a row that drills into/navigates to something, e.g. the
// map category picker's "view this category" affordance.
export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

// Handset — phone number rows on the map place-detail panel.
export function PhoneIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 4h3.5l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3.5c0 1-.9 1.8-1.9 1.7A17.5 17.5 0 0 1 3.3 5.9c-.1-1 .7-1.9 1.7-1.9z" />
    </svg>
  )
}

// Turn arrow — the map place-detail panel's "Directions" action button.
export function DirectionsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 18l6-6-6-6" />
      <path d="M4 21v-6a3 3 0 0 1 3-3h8" />
    </svg>
  )
}

// Globe (meridians on a circle) — the place-detail panel's "Website" action
// button, matching Google Maps' own icon for that button instead of a
// generic outbound-link arrow.
export function GlobeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  )
}

// Four outward-pointing corner arrows — the desktop map's "expand to
// fullscreen" control.
export function ExpandIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 4H4v5" />
      <path d="M15 4h5v5" />
      <path d="M9 20H4v-5" />
      <path d="M15 20h5v-5" />
    </svg>
  )
}

// Four inward-pointing corner arrows — the desktop map's "exit fullscreen"
// control, shown in the same spot once expanded.
export function CollapseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 9h5V4" />
      <path d="M20 9h-5V4" />
      <path d="M4 15h5v5" />
      <path d="M20 15h-5v5" />
    </svg>
  )
}

// Crosshair — "measure distances from this listing" (see SetLocationButton).
// Deliberately NOT PinIcon: this button sits immediately right of the address
// row, whose own left gutter is already a PinIcon, and the header location
// pill and the pinned-shortlist toggle both use it too. A second pin inches
// from the first would read as decoration rather than an action.
export function CrosshairIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
