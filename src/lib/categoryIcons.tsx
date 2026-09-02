// Category glyphs — flat white/currentColor line icons (matching the
// hand-drawn stroke style already used in components/icons.tsx: 24x24
// viewBox, stroke-based, round caps/joins), used wherever a category's icon
// renders as a small glyph across the site: the map's pins, filter chips,
// the category picker, listing card avatars, the bottom tab bar, home-screen
// tiles. Swapped in for the plain emoji (category.icon) everywhere it reads
// as an on-screen glyph — a colorful, platform-inconsistent emoji looks
// noticeably rougher at icon scale than a flat line icon does.
//
// This is presentational only — `category.icon` (the emoji) is still the
// real stored value (what an admin picks in the category editor, what a
// category with no hand-built icon here falls back to showing). Nothing
// about the data model changes; this is purely what gets drawn on screen.
//
// Keyed by category id (CategoryConfig.id / MapPoint.filterId) plus the
// synthetic hospitals filter id (see ResourceMapView's HOSPITALS_FILTER_ID).
// A category with no entry here keeps rendering its plain emoji (every call
// site below falls back to `icon`) — this is deliberately not exhaustive,
// just covering the categories real communities actually use; a custom
// admin-created category with no matching entry is unaffected.

// Plain-letter glyphs — an "H" for hospitals, the universal map-pin
// convention (see e.g. Google's own hospital POI pins) — rendered as text
// rather than a stroked path, since a stroked letterform at icon weight/size
// just looks smudged.
const CATEGORY_ICON_TEXT: Record<string, string> = {
  hospital: 'H',
  __hospitals__: 'H',
}

// Inner SVG markup (no outer <svg> tag) for each category — shared by the
// React component below (CategoryGlyph, via dangerouslySetInnerHTML) and
// the plain-DOM builder (glyphElementFor, for the Google Maps marker, which
// isn't React and needs a real Element for PinElement's `glyph`).
//
// restaurant/grocery/hotel/mikvah/synagogue/childcare/school are ported
// from the explore-new-format-ariel-12 design-exploration branch's own
// icons.tsx (FORK_ICON_PATHS, CART_ICON_PATHS/CIRCLES, DROP_ICON_PATHS,
// STAR_ICON_PATHS, PACIFIER_ICON_PATHS/CIRCLES, BED_ICON_PATHS,
// SCHOOL_ICON_PATHS) — geometry only, not that branch's palette/layout
// work. That branch iterated each one against actual visitor feedback
// (a teddy-bear head read as a blob at pin size → pacifier; a single fork
// → fork+knife pair; a suitcase-like bed frame → a plainer side-profile
// bed), which is a level of real-world testing worth keeping over redrawing
// these from scratch.
const CATEGORY_ICON_MARKUP: Record<string, string> = {
  restaurant:
    '<path d="M4 2v6"/><path d="M6.5 2v6"/><path d="M9 2v6"/><path d="M4 8a2.5 2.5 0 0 0 5 0"/><path d="M6.5 10v12"/><path d="M20.5 2v9.5"/><path d="M20.5 2c-2.8 0 -3.5 3.5 -3.5 5.5s1.2 3.5 3.5 4"/><path d="M20.5 11.5v10.5"/>',
  grocery:
    '<path d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.9h8.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>',
  // A side-profile bed — headboard post, mattress/frame line, floor line,
  // pillow divider — not a boxy double-frame; that read as furniture in
  // general rather than specifically a bed.
  hotel: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  mikvah: '<path d="M12 3s6.2 7.3 6.2 11.6A6.2 6.2 0 0 1 5.8 14.6C5.8 10.3 12 3 12 3z"/>',
  synagogue: '<path d="M12 3 L19.8 16.5 L4.2 16.5 Z"/><path d="M12 21 L4.2 7.5 L19.8 7.5 Z"/>',
  // A pacifier (ring + shield) — a teddy-bear head read as an
  // unrecognizable solid blob once crushed to silhouette at pin size.
  childcare: '<circle cx="12" cy="6" r="2.3"/><path d="M9.7 8.1v1"/><path d="M7 10.3h10a1 1 0 0 1 1 1v.7a6 6 0 0 1-12 0v-.7a1 1 0 0 1 1-1z"/>',
  school: '<path d="M12 4L4 8.5L12 13L20 8.5Z"/><path d="M20 8.5V14"/><path d="M7.5 10.2V14.5a4.5 3 0 0 0 9 0v-4.3"/>',
  'eruv-information': '<circle cx="8.5" cy="12" r="4"/><circle cx="15.5" cy="12" r="4"/>',
  whatsapp:
    '<path d="M21 11.5A8.5 8.5 0 0 1 9.4 19.4L3 21l1.7-6.2A8.5 8.5 0 1 1 21 11.5Z"/>',
  'young-professional':
    '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M2.5 20c0-3.1 2.5-5.5 5.5-5.5s5.5 2.4 5.5 5.5"/><path d="M14.5 20c0-2.4 1.9-4.3 4.3-4.3S21.5 17.6 21.5 20"/>',
  // Headstone outline, same two paths as before; the carving on its face
  // used to be a plain plus/cross (M12 9.5v4M10 11.5h4) — read as a
  // Christian cross, wrong for a Jewish cemetery. Replaced with a Star of
  // David: the same two-overlapping-triangles technique the synagogue icon
  // above already uses, scaled to fit the headstone's face. The star's own
  // two paths carry an explicit, thinner stroke-width (overriding
  // CategoryGlyph's shared 1.8 default, which SVG lets a child element do) —
  // at the small size a carving has to be, 1.8 made six crossing line
  // segments read as a bold, blobby mark rather than a crisp star; a
  // lighter stroke on a slightly larger star reads as a silhouette instead.
  cemetery:
    '<path d="M7 21V11a5 5 0 0 1 10 0v10"/><path d="M7 21h10"/><path d="M12 12.2 L14.6 16.7 L9.4 16.7 Z" stroke-width="1.1"/><path d="M12 18.2 L9.4 13.7 L14.6 13.7 Z" stroke-width="1.1"/>',
  zmanim: '<path d="M12 2.5c1.6 2 2.2 3.6 2.2 5a2.2 2.2 0 1 1-4.4 0c0-1.4.6-3 2.2-5Z"/><path d="M9 21.5h6M12 9v12.5"/>',
}

/** Whether CategoryGlyph would draw a hand-built icon for `categoryId`
 *  rather than falling back to plain emoji text — for a caller that needs
 *  to style around that difference (e.g. MobileTabBar's active/inactive
 *  tint only works on the former; raw emoji ignores CSS color). */
export function hasCategoryIcon(categoryId: string | undefined): boolean {
  return !!categoryId && (categoryId in CATEGORY_ICON_TEXT || categoryId in CATEGORY_ICON_MARKUP)
}

type Props = {
  /** The category (or hospitals-filter) id — CategoryConfig.id, or
   *  ResourceMapView's HOSPITALS_FILTER_ID. Undefined (a place with no
   *  resolved category yet) just falls back to `icon`. */
  categoryId: string | undefined
  /** The category's plain emoji — rendered as-is when there's no hand-built
   *  icon for `categoryId`. */
  icon: string
  className?: string
}

/** A category's glyph — the hand-built line icon for `categoryId` when one
 *  exists, its plain emoji otherwise. Stroke/fill is `currentColor`, so the
 *  caller controls color the normal CSS way (a text-* class, or an inline
 *  `color`) exactly like every other icon in components/icons.tsx.
 *
 *  Both branches render an <svg> with the same 24x24 viewBox — including
 *  the "H" text glyph, which could otherwise just be a <span> — so a
 *  caller's sizing className (e.g. CategoryIcon's `w-[55%] h-[55%]`) means
 *  the same thing regardless of which category it ends up drawing; a plain
 *  text span sized by width/height classes doesn't scale its font to fit
 *  them the way viewBox-relative SVG content does. */
export function CategoryGlyph({ categoryId, icon, className }: Props) {
  const text = categoryId ? CATEGORY_ICON_TEXT[categoryId] : undefined
  if (text) {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <text x="12" y="17.5" textAnchor="middle" fontSize="16" fontWeight="700" fontFamily="system-ui, sans-serif" fill="currentColor">
          {text}
        </text>
      </svg>
    )
  }
  const markup = categoryId ? CATEGORY_ICON_MARKUP[categoryId] : undefined
  if (!markup) return <>{icon}</>
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      // eslint-disable-next-line react/no-danger -- static, developer-authored markup, not user input
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}

/** The plain-DOM equivalent of CategoryGlyph, for the one caller that isn't
 *  React: ResourceMap.tsx builds Google Maps markers by hand, and
 *  PinElement's `glyph` slot wants a real Element (or a plain string it
 *  renders as text) — not JSX. Always white (map pins have a solid color
 *  background); `glyphColor` on PinElement is ignored once `glyph` is an
 *  Element, so this has to color itself rather than relying on that. */
export function glyphElementFor(categoryId: string | undefined): SVGElement | undefined {
  const markup = categoryId ? CATEGORY_ICON_MARKUP[categoryId] : undefined
  if (!markup) return undefined
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '18')
  svg.setAttribute('height', '18')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', '#ffffff')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.innerHTML = markup
  return svg
}

/** The plain-text equivalent of CategoryGlyph's text-glyph branch (an "H"
 *  for hospitals) — PinElement happily takes a plain string as `glyph` and
 *  colors it via `glyphColor`, so the map marker doesn't need an Element for
 *  this case the way glyphElementFor's icons do. */
export function glyphTextFor(categoryId: string | undefined): string | undefined {
  return categoryId ? CATEGORY_ICON_TEXT[categoryId] : undefined
}
