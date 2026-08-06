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

// Path/circle data for the map's childcare (toy/teddy bear) and hotel (bed)
// pin icons — plain geometry, exported alongside the React components below
// so ResourceMap.tsx's marker layer (which builds pin glyphs as raw SVG DOM
// nodes — Google Maps markers aren't React-rendered) can draw the exact same
// shapes. Single source of truth, so the map key's category buttons
// (rendered via the React components) and the pins themselves (ResourceMap's
// own SVG builder) can never drift apart. Both replace an emoji (🧸, 🛏️)
// that reads as a chunky solid blob once crushed to a silhouette at pin
// size — these are drawn as open, hollow-stroke shapes from the start
// instead, so there's nothing to crush.
export const TOY_ICON_CIRCLES = [
  { cx: 12, cy: 7.5, r: 3.5 }, // head
  { cx: 7.8, cy: 4, r: 2 }, // left ear
  { cx: 16.2, cy: 4, r: 2 }, // right ear
]
export const TOY_ICON_PATHS = ['M6.5 12.5a5.5 5.5 0 0 1 11 0v4a5.5 5.5 0 0 1-11 0z'] // body
export const BED_ICON_PATHS = [
  'M2 20v-7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v7', // frame
  'M2 20h20', // floor line
  'M4 11V6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5', // headboard
  'M5 11h4v3h-4z', // pillow
  'M10 13h11', // blanket fold
]

// Path data for the map's synagogue (Magen David), restaurant (fork), grocery
// (cart), and mikvah (water drop) pin icons — same open hollow-stroke
// treatment as TOY_ICON_PATHS/BED_ICON_PATHS above, replacing those
// categories' emoji glyphs (✡, 🍴, 🛒, 💧) so the pastel pin palette's
// "darker version of the same hue" glyph tint (see `darkenForGlyph` in
// ResourceMap.tsx) has a stroke to color — a CSS filter crush can only ever
// produce pure black/white on an emoji, never an arbitrary hue.
export const STAR_ICON_PATHS = ['M12 3 L19.8 16.5 L4.2 16.5 Z', 'M12 21 L4.2 7.5 L19.8 7.5 Z']
export const FORK_ICON_PATHS = ['M8 2v7', 'M12 2v7', 'M16 2v7', 'M8 9a4 4 0 0 0 8 0', 'M12 13v9']
export const CART_ICON_PATHS = ['M3 4h2l2.4 12.4a2 2 0 0 0 2 1.9h8.2a2 2 0 0 0 2-1.6L21 8H6']
export const CART_ICON_CIRCLES = [
  { cx: 9, cy: 20, r: 1.5 },
  { cx: 17, cy: 20, r: 1.5 },
]
export const DROP_ICON_PATHS = ['M12 3s6.2 7.3 6.2 11.6A6.2 6.2 0 0 1 5.8 14.6C5.8 10.3 12 3 12 3z']

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

// Childcare's map pin/key-button icon — a teddy bear head/ears/body, open
// hollow-stroke shapes (no fill) so it reads as a simple outline instead of
// the 🧸 emoji's chunky solid silhouette once crushed at pin size. Geometry
// shared with the map's own pin glyphs — see `TOY_ICON_PATHS`/
// `TOY_ICON_CIRCLES` above.
export function ToyIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      {TOY_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
      {TOY_ICON_CIRCLES.map((c) => (
        <circle key={`${c.cx}-${c.cy}`} cx={c.cx} cy={c.cy} r={c.r} />
      ))}
    </svg>
  )
}

// Hotel's map pin/key-button icon — a bed frame with headboard, pillow, and
// a blanket-fold line, same open hollow-stroke treatment as ToyIcon above
// (replacing the 🛏️ emoji). Geometry shared with the map's own pin glyphs —
// see `BED_ICON_PATHS` above.
export function BedIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      {BED_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

// Magen David — the app's brand mark (thinner 1.7 stroke, no linecap, so it
// renders identically everywhere rather than falling back to the ✡ emoji glyph).
// To rebrand for another community, replace this SVG (and src/app/favicon.ico).
// Geometry shared with the map's synagogue pin glyph — see STAR_ICON_PATHS above.
export function StarOfDavid({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" className={className} aria-hidden="true">
      {STAR_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

// Restaurant's map pin/key-button icon — a fork, same open hollow-stroke
// treatment as ToyIcon/BedIcon above (replacing the 🍴 emoji). Geometry
// shared with the map's own pin glyphs — see FORK_ICON_PATHS above.
export function ForkIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      {FORK_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

// Grocery's map pin/key-button icon — a shopping cart, replacing the 🛒
// emoji. Geometry shared with the map's own pin glyphs — see
// CART_ICON_PATHS/CART_ICON_CIRCLES above.
export function CartIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      {CART_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
      {CART_ICON_CIRCLES.map((c) => (
        <circle key={`${c.cx}-${c.cy}`} cx={c.cx} cy={c.cy} r={c.r} />
      ))}
    </svg>
  )
}

// Mikvah's map pin/key-button icon — a water drop, replacing the 💧 emoji.
// Geometry shared with the map's own pin glyphs — see DROP_ICON_PATHS above.
export function DropIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      {DROP_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
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
