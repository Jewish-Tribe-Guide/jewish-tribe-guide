// Builders for Google Maps deep links.
//
// On mobile these URLs open the native Google Maps app (with live GPS and
// turn-by-turn); on desktop they open maps.google.com. Note the platform
// limit: there is NO public URL that loads our own custom, multi-pin filtered
// layer into the Maps app — custom pin sets require Google "My Maps", which has
// no live navigation. So the most we can hand off is (a) directions to one
// place, or (b) a category search centered on the visitor, which the app then
// plots and lets the user navigate live.

export type LatLng = { lat: number; lng: number }

/** Live directions to a single destination (address preferred; falls back to
 *  coordinates). Opens turn-by-turn in the Google Maps app on mobile. */
export function directionsUrl(destination: string | LatLng): string {
  const dest = typeof destination === 'string' ? destination : `${destination.lat},${destination.lng}`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
}

/** Whether `name` shows up in `address` — the signal for whether adding the
 *  name to a Maps search is likely to help or hurt (see businessUrl). A
 *  listing whose address names its own building/plaza ("123 Main St, ABC
 *  Plaza") passes; a plain street address never will, regardless of how
 *  well-known the business actually is. */
function nameAppearsInAddress(name: string, address: string): boolean {
  return address.toLowerCase().includes(name.toLowerCase())
}

/** Opens the business's Google Maps listing (name + address search, or exact
 *  place if a placeId is known). Shows hours, phone, photos, etc.
 *
 *  The name only joins the query when it's recognizable in the address
 *  itself. Google's business search leans on the name to disambiguate, so
 *  for a listing it can't find by that name — a mikvah run out of someone's
 *  home, say, with no storefront for Google to have indexed — the name
 *  doesn't narrow the search, it derails it: Google fuzzy-matches to
 *  whatever similarly-named place it DOES know about, overriding an address
 *  that was exact on its own. Dropping the name there falls back to a plain
 *  address search, which has nothing to get wrong. */
export function businessUrl(name: string, address?: string | null, placeId?: string | null): string {
  const nameHelps = !address || nameAppearsInAddress(name, address)
  const query = [nameHelps ? name : null, address].filter(Boolean).join(' ')
  const params = new URLSearchParams({ api: '1', query })
  if (placeId) params.set('query_place_id', placeId)
  return `https://www.google.com/maps/search/?${params.toString()}`
}

/** A category search ("kosher grocery", "synagogue", …) centered on the
 *  visitor's location when known, so the Maps app opens already focused on
 *  what's nearby. Without a location it's a plain search Maps centers itself. */
export function searchNearUrl(query: string, near?: LatLng | null): string {
  const params = new URLSearchParams({ api: '1', query })
  if (near) params.set('query', `${query} near ${near.lat},${near.lng}`)
  return `https://www.google.com/maps/search/?${params.toString()}`
}
