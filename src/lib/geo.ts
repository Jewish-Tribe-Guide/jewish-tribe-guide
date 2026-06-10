// Geo helpers: distance math (client + server safe) and address geocoding (server).

export type LatLng = { lat: number; lng: number }

// Great-circle distance in miles between two points.
export function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8 // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(s))
}

// Rounded to one decimal, the way distances are shown.
export function distanceMiles(a: LatLng, b: LatLng): number {
  return Math.round(haversineMiles(a, b) * 10) / 10
}

// Geocodes a free-text address to coordinates. Tries Google first (best
// accuracy, when the Geocoding API is enabled on the project) and falls back to
// OpenStreetMap/Nominatim (free, no key). Returns null if neither resolves it.
// Server-side only.
export async function geocode(address: string): Promise<LatLng | null> {
  const q = address.trim()
  if (!q) return null
  return (await geocodeGoogle(q)) ?? (await geocodeNominatim(q))
}

async function geocodeGoogle(q: string): Promise<LatLng | null> {
  // A SERVER-side key (no referrer restriction). The public NEXT_PUBLIC key is
  // referrer-restricted and can't be used here. Optional — if unset, we fall
  // back to Nominatim. (Most coordinates come from the client autocomplete.)
  const key = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.GOOGLE_GEOCODING_API_KEY
  if (!key) return null
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as {
      status: string
      results: { geometry: { location: { lat: number; lng: number } } }[]
    }
    if (data.status !== 'OK' || !data.results[0]) return null
    const loc = data.results[0].geometry.location
    return { lat: loc.lat, lng: loc.lng }
  } catch {
    return null
  }
}

async function geocodeNominatim(q: string): Promise<LatLng | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JewishPatientConnect/1.0 (yhagler@gmail.com)' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { lat: string; lon: string }[]
    if (!data[0]) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}
