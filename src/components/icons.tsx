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

/** A camera, for "change this photo" on the editor's avatar. */
export function CameraIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
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

// Thumbtack — "save to my shortlist" (the Pin/Pinned action, wherever
// useListingActions' actions are drawn),
// deliberately a different shape from PinIcon's map-marker teardrop: that one
// means "a place on a map," this one means "I bookmarked this," and reusing
// the same glyph for both blurred the distinction.
//
// Pinned (filled) is the real 📌 emoji, not a hand-drawn stroke path — every
// attempt at redrawing a pushpin from scratch (a circle + a line/wedge,
// rotated or not) read as a balloon, a key, or a magnifying glass instead, at
// both large and icon-sized (16px) previews. The actual glyph is instantly
// recognizable at every size specifically because of the head/needle
// proportions no simple stroke shape reproduced. `brightness-0` flattens its
// color to a plain black silhouette (alpha-preserving, unlike grayscale) so
// it reads as one of this menu's monochrome icons rather than standing out
// in red; `opacity-75` is the "thinner/lighter" match for their 1.8px stroke
// weight — full opacity read noticeably heavier side by side with
// PencilIcon/ExternalIcon in a live comparison.
//
// Unpinned (unfilled) can't reuse that trick — there's no hollow/outline
// variant of an emoji glyph, no CSS filter turns a raster glyph into a line
// drawing. Falls back to a hand-drawn outline instead, same `fill="none"` /
// `currentColor`-stroke convention PinIcon itself uses for its own unset
// state — traced against real reference pushpin-outline icons (cap, a
// bulged body wider than the cap tapering to a point, then the needle),
// not the abstract circle/wedge shapes tried first, which read as a
// balloon or a key rather than a tack even in isolation.
// Unfilled state: not hand-drawn. No redrawn shape (a circle+wedge, a
// rotated cap/body/needle) ever read as a pushpin rather than a balloon or a
// key — see this icon's other comment. This PNG is instead traced directly
// off the same 📌 glyph the filled state renders: draw it to a canvas,
// threshold alpha to a silhouette, erode that silhouette a few pixels, and
// keep only the ring the erosion peeled off. That ring *is* the glyph's own
// outline, pixel-for-pixel — not an approximation of it — which is what
// makes the two states read as "the same icon, toggled" instead of two
// unrelated drawings.
const THUMBTACK_OUTLINE_PNG =
  'data:image/png;base64,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'

export function ThumbtackIcon({ className, filled }: IconProps & { filled?: boolean }) {
  if (filled) {
    return (
      <span aria-hidden="true" className={`inline-flex items-center justify-center text-base leading-none brightness-0 opacity-75 ${className ?? ''}`}>
        📌
      </span>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element -- inline data: URI, not a real asset next/image could optimize
  return <img alt="" aria-hidden="true" draggable={false} src={THUMBTACK_OUTLINE_PNG} className={`opacity-90 ${className ?? ''}`} />
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

// Three filled dots, not stroked paths like every icon above — a kebab menu
// trigger reads as three small solid marks, not an outlined shape, so this
// sets its own fill instead of using `base`'s stroke-only style.
export function DotsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

// A simple city-skyline silhouette — filled shapes, not stroked lines like
// every icon above, since a skyline reads as solid rooftops against sky
// rather than an outlined pictogram. A row of plain rectangle "rooftops"
// flanking one taller, stepped tower loosely standing in for Philadelphia
// City Hall's own silhouette, without depicting the real building closely
// enough to need a licensed asset. Purely decorative wherever it's used
// (HeroHeading, SiteFooter) — callers render it aria-hidden.
export function SkylineIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 -14 200 104" fill="currentColor" aria-hidden="true" className={className}>
      <rect x="0" y="46" width="22" height="44" />
      <rect x="26" y="30" width="18" height="60" />
      <rect x="48" y="54" width="16" height="36" />
      {/* The stepped tower, with a slim spire on top. */}
      <rect x="86" y="10" width="28" height="80" />
      <rect x="92" y="0" width="16" height="14" />
      <rect x="97" y="-14" width="6" height="16" />
      <rect x="118" y="38" width="20" height="52" />
      <rect x="142" y="24" width="18" height="66" />
      <rect x="164" y="50" width="16" height="40" />
      <rect x="184" y="36" width="16" height="54" />
    </svg>
  )
}

// People — UpdateListingsCard's header icon (Phase 6, desktop mockup
// rework). Two overlapping figures, not one — "kept by the community" is
// about the group, not an individual.
export function PeopleIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.2c2.6.4 4.5 2.6 4.5 5.3" />
    </svg>
  )
}

// A single stylized leaf — stands in for the Sukkot/schach greenery this
// banner is themed around without depicting a real sukkah. Used both as the
// photo placeholder's faint watermark glyph and the banner's own decorative
// corner accent (see CampaignBannerCard's desktop block).
export function LeafIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M11 20c8 0 11-6 11-13-7 0-13 3-13 11 0-8-6-11-13-11 0 7 3 13 15 13Z" />
      <path d="M11 20V7" />
    </svg>
  )
}

