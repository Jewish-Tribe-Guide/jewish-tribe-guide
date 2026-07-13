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

// Location pin — the header's "Set location" mark and the mobile distance strip.
export function PinIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21c-4.4-3.9-7-7.4-7-10.8A7 7 0 0 1 12 3a7 7 0 0 1 7 7.2c0 3.4-2.6 6.9-7 10.8z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  )
}

// Magen David — the brand mark (thinner 1.7 stroke, no linecap, so it renders
// identically everywhere rather than falling back to the ✡ emoji glyph).
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
