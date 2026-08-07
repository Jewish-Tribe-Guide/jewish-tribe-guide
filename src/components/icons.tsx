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

// Path/circle data for the map's childcare (pacifier) and hotel (bed)
// pin icons — plain geometry, exported alongside the React components below
// so ResourceMap.tsx's marker layer (which builds pin glyphs as raw SVG DOM
// nodes — Google Maps markers aren't React-rendered) can draw the exact same
// shapes. Single source of truth, so the map key's category buttons
// (rendered via the React components) and the pins themselves (ResourceMap's
// own SVG builder) can never drift apart. Both replace an emoji (🧸, 🛏️)
// that reads as a chunky solid blob once crushed to a silhouette at pin
// size — these are drawn as open, hollow-stroke shapes from the start
// instead, so there's nothing to crush. The childcare glyph was a
// teddy-bear head (circle + two ear circles) originally, but that read as
// an unrecognizable blob at actual pin size — a pacifier (ring + shield)
// on request reads clearly even that small.
export const PACIFIER_ICON_CIRCLES = [
  { cx: 12, cy: 6, r: 2.3 }, // ring/handle
]
export const PACIFIER_ICON_PATHS = [
  'M9.7 8.1v1', // short stem connecting the ring to the shield
  'M7 10.3h10a1 1 0 0 1 1 1v.7a6 6 0 0 1-12 0v-.7a1 1 0 0 1 1-1z', // shield
]
// Was a suitcase-reading frame+pillow+blanket-fold combo that didn't read
// as a bed at actual pin size — replaced on request with a plainer side
// profile (headboard post, mattress/frame line, floor line, pillow
// divider) that holds up better that small.
export const BED_ICON_PATHS = [
  'M2 4v16', // headboard post
  'M2 8h18a2 2 0 0 1 2 2v10', // mattress top + frame corner + right wall
  'M2 17h20', // floor line
  'M6 8v9', // pillow/headboard divider
]

// Path data for the map's synagogue (Magen David), restaurant (fork), grocery
// (cart), and mikvah (water drop) pin icons — same open hollow-stroke
// treatment as PACIFIER_ICON_PATHS/BED_ICON_PATHS above, replacing those
// categories' emoji glyphs (✡, 🍴, 🛒, 💧) so the pastel pin palette's
// "darker version of the same hue" glyph tint (see `darkenForGlyph` in
// ResourceMap.tsx) has a stroke to color — a CSS filter crush can only ever
// produce pure black/white on an emoji, never an arbitrary hue.
export const STAR_ICON_PATHS = ['M12 3 L19.8 16.5 L4.2 16.5 Z', 'M12 21 L4.2 7.5 L19.8 7.5 Z']
// A fork+knife pair (was a fork alone) — on request, the standard
// "restaurant" pictogram instead of a single utensil. Both halves
// compressed to fit the same 24-wide viewBox as every other single-glyph
// icon here: three tines (4/6.5/9) merging into a handle on the left, a
// closed blade shape (straight spine, curved cutting edge) merging into
// its own handle on the right. The knife's cutting edge curves toward the
// fork/center (spine straight along the outer right edge) — was mirrored
// the other way at first, flipped on request to match the Google Maps
// restaurant pin convention. Verified at actual pin size (~15px) — the gap
// between the two halves reads clearly even that small.
export const FORK_ICON_PATHS = [
  'M4 2v6', // tine 1
  'M6.5 2v6', // tine 2
  'M9 2v6', // tine 3
  'M4 8a2.5 2.5 0 0 0 5 0', // tines merge
  'M6.5 10v12', // fork handle
  'M20.5 2v9.5', // knife spine (outer edge)
  'M20.5 2c-2.8 0 -3.5 3.5 -3.5 5.5s1.2 3.5 3.5 4', // knife cutting edge (curves inward, toward the fork)
  'M20.5 11.5v10.5', // knife handle
]
export const CART_ICON_PATHS = ['M3 4h2l2.4 12.4a2 2 0 0 0 2 1.9h8.2a2 2 0 0 0 2-1.6L21 8H6']
export const CART_ICON_CIRCLES = [
  { cx: 9, cy: 20, r: 1.5 },
  { cx: 17, cy: 20, r: 1.5 },
]
export const DROP_ICON_PATHS = ['M12 3s6.2 7.3 6.2 11.6A6.2 6.2 0 0 1 5.8 14.6C5.8 10.3 12 3 12 3z']
// School's map pin/key-button icon — a graduation cap, same open
// hollow-stroke treatment as the others above, replacing the admin-set
// pencil emoji (✏️) on request, since it didn't read as a "school" symbol
// at pin size and the pencil's straight diagonal also clashed with every
// other category's rounder linework.
export const SCHOOL_ICON_PATHS = ['M12 4L4 8.5L12 13L20 8.5Z', 'M20 8.5V14', 'M7.5 10.2V14.5a4.5 3 0 0 0 9 0v-4.3']

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

// Childcare's map pin/key-button icon — a pacifier (ring + shield), open
// hollow-stroke shapes (no fill) so it reads as a simple outline instead of
// the 🧸 emoji's chunky solid silhouette once crushed at pin size. Geometry
// shared with the map's own pin glyphs — see `PACIFIER_ICON_PATHS`/
// `PACIFIER_ICON_CIRCLES` above.
export function PacifierIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      {PACIFIER_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
      {PACIFIER_ICON_CIRCLES.map((c) => (
        <circle key={`${c.cx}-${c.cy}`} cx={c.cx} cy={c.cy} r={c.r} />
      ))}
    </svg>
  )
}

// Hotel's map pin/key-button icon — a bed frame with headboard, pillow, and
// a blanket-fold line, same open hollow-stroke treatment as PacifierIcon
// above (replacing the 🛏️ emoji). Geometry shared with the map's own pin
// glyphs — see `BED_ICON_PATHS` above.
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

// Restaurant's map pin/key-button icon — a fork+knife pair (was a fork
// alone), same open hollow-stroke treatment as PacifierIcon/BedIcon above
// (replacing the 🍴/🍽️ emoji). Geometry shared with the map's own pin
// glyphs — see FORK_ICON_PATHS above. Kept the `Fork`-only name (the fork
// is still half the glyph) rather than renaming every call site for a
// cosmetic-only mismatch.
export function ForkIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      {FORK_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

// School's map pin/key-button icon — a graduation cap, same open
// hollow-stroke treatment as the others above (replacing the ✏️ emoji).
// Geometry shared with the map's own pin glyphs — see SCHOOL_ICON_PATHS
// above.
export function SchoolIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      {SCHOOL_ICON_PATHS.map((d) => (
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
