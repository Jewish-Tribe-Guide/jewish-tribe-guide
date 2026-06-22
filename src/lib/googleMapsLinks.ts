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

/** Opens the business's Google Maps listing (name + address search, or exact
 *  place if a placeId is known). Shows hours, phone, photos, etc. */
export function businessUrl(name: string, address?: string | null, placeId?: string | null): string {
  const query = [name, address].filter(Boolean).join(' ')
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
