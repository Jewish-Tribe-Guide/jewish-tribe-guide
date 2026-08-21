// Map-pin glyphs — flat white line icons (matching the hand-drawn stroke
// style already used in components/icons.tsx: 24x24 viewBox, stroke-based,
// round caps/joins), swapped in for a category's plain emoji specifically
// inside a map pin. The emoji itself (category.icon) still renders
// everywhere else on the site — the category tiles, listing cards, the
// pin's own small corner badge in MapPlaceDetail — this only overrides what
// shows inside the Google-style teardrop marker, where a colorful,
// platform-inconsistent emoji reads noticeably worse at ~18px than a flat
// icon does. Not built as components/icons.tsx React components: nothing
// else needs these yet, and PinElement's `glyph` wants a real DOM Element
// (or a plain string it renders as text), not JSX — see glyphElementFor.
//
// Keyed by category id (matches CategoryConfig.id / MapPoint.filterId) plus
// the synthetic hospitals filter id (see ResourceMapView's HOSPITALS_FILTER_ID).
// A category with no entry here keeps using its plain emoji glyph (see
// glyphElementFor's fallback) — this is deliberately not exhaustive, just
// covering the categories real communities actually use.
const PIN_ICON_MARKUP: Record<string, string> = {
  restaurant:
    '<path d="M8 2v6a1.5 1.5 0 0 0 3 0V2"/><path d="M9.5 8v14"/><path d="M16 2c-1.7 0-3 1.8-3 4s1.3 4 3 4v10"/>',
  grocery:
    '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2l2.7 12.6a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H6.2"/>',
  hospital: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 7.5v9M7.5 12h9"/>',
  __hospitals__: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 7.5v9M7.5 12h9"/>',
  hotel:
    '<path d="M3 19v-6.5A1.5 1.5 0 0 1 4.5 11H10a1.5 1.5 0 0 1 1.5 1.5V14"/><path d="M12.5 14v-1.5A1.5 1.5 0 0 1 14 11h5.5A1.5 1.5 0 0 1 21 12.5V19"/><path d="M3 19h18"/><path d="M3 15.5h18"/>',
  mikvah: '<path d="M12 3s6 7.2 6 11.2a6 6 0 0 1-12 0C6 10.2 12 3 12 3z"/>',
  synagogue: '<path d="M12 3 19 15.5H5Z"/><path d="M12 21 5 8.5h14Z"/>',
  childcare:
    '<rect x="9" y="10" width="6" height="10" rx="2"/><path d="M10 10V6.5a2 2 0 0 1 4 0V10"/><path d="M9 14h6"/>',
  school: '<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 10.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.5"/>',
  'eruv-information': '<circle cx="8.5" cy="12" r="4"/><circle cx="15.5" cy="12" r="4"/>',
  whatsapp:
    '<path d="M21 11.5A8.5 8.5 0 0 1 9.4 19.4L3 21l1.7-6.2A8.5 8.5 0 1 1 21 11.5Z"/>',
  'young-professional':
    '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M2.5 20c0-3.1 2.5-5.5 5.5-5.5s5.5 2.4 5.5 5.5"/><path d="M14.5 20c0-2.4 1.9-4.3 4.3-4.3S21.5 17.6 21.5 20"/>',
  cemetery: '<path d="M7 21V11a5 5 0 0 1 10 0v10"/><path d="M7 21h10"/><path d="M12 9.5v4M10 11.5h4"/>',
  zmanim: '<path d="M12 2.5c1.6 2 2.2 3.6 2.2 5a2.2 2.2 0 1 1-4.4 0c0-1.4.6-3 2.2-5Z"/><path d="M9 21.5h6M12 9v12.5"/>',
}

/** Builds the pin glyph for `categoryId`, or `undefined` when there's no
 *  hand-built icon for it — callers should fall back to the plain emoji
 *  glyph in that case (see ResourceMap.tsx's buildPin). Deliberately white
 *  stroke, not `glyphColor` (PinElement ignores glyphColor once glyph is an
 *  Element rather than a string — this has to color itself). */
export function glyphElementFor(categoryId: string | undefined): SVGElement | undefined {
  const markup = categoryId ? PIN_ICON_MARKUP[categoryId] : undefined
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
