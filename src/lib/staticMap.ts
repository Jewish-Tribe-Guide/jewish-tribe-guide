// ── A picture of a place on the map: Google's Maps Static API ──────────────
// The listing's map tile (board B1, Nov 16) is one image a view, fetched
// when it scrolls into sight; there's no lookup before it, since the place's
// coordinates are already stored. Google's terms don't allow keeping the
// pictures on our side, so it is always this address.

/** The pin, in the site's blue (`--color-primary`). */
const PIN = '0x1d4ed8'

/** `zoom`: 16 shows a place's street (the listing's tile); about 13 shows
 *  a neighbourhood (an admin's default location). */
export function staticMapUrl(geo: { lat: number; lng: number }, key: string, size: { width: number; height: number }, zoom = 16): string {
  const at = `${geo.lat.toFixed(6)},${geo.lng.toFixed(6)}`
  const params = new URLSearchParams({
    center: at,
    zoom: String(zoom),
    // Twice the pixels, for a phone's screen; Google's limit is 640 a side.
    size: `${Math.min(640, Math.round(size.width))}x${Math.min(640, Math.round(size.height))}`,
    scale: '2',
    markers: `color:${PIN}|${at}`,
    key,
  })
  // Without the labels of shops and museums: one sat under the tile's pill
  // on the board, and the pin is the only place it's about.
  params.append('style', 'feature:poi|element:labels|visibility:off')
  params.append('style', 'feature:transit|element:labels|visibility:off')
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`
}

/** "Food's", "Synagogues'". */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`
}
