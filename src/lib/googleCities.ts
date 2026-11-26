// New community's "Which city?" (Nov 25, board 1): Google's city
// suggestions and, for the one picked, where it is. Server-side, with the
// Maps server key, so it works wherever the site runs (the browser key is
// refused on localhost) and a test can answer for Google at our own route.

const TIMEOUT_MS = 10_000

function serverKey(): string | null {
  return process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.GOOGLE_GEOCODING_API_KEY ?? null
}

/** One suggestion: "Baltimore" in "MD, USA". */
export type CitySuggestion = { placeId: string; city: string; area: string }

/** A picked city: its name, the state (or country) it's in written out,
 *  and its centre. */
export type City = { city: string; area: string; lat: number; lng: number }

/** Up to five cities for what's typed. Null when Google can't be asked or
 *  doesn't answer, so the screen can say so rather than "no matches". */
export async function suggestCities(input: string): Promise<CitySuggestion[] | null> {
  const key = serverKey()
  const q = input.trim()
  if (!key) return null
  if (!q) return []
  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&types=(cities)&key=${key}`
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const data = (await res.json()) as {
      status: string
      predictions?: { place_id?: string; description?: string; structured_formatting?: { main_text?: string; secondary_text?: string } }[]
    }
    if (data.status === 'ZERO_RESULTS') return []
    if (data.status !== 'OK') return null
    return (data.predictions ?? [])
      .flatMap((p) => {
        const city = p.structured_formatting?.main_text ?? p.description?.split(',')[0]
        return p.place_id && city ? [{ placeId: p.place_id, city, area: p.structured_formatting?.secondary_text ?? '' }] : []
      })
      .slice(0, 5)
  } catch {
    return null
  }
}

type Component = { long_name?: string; types?: string[] }

/** Where a suggested city is. Asks for its location and address parts only,
 *  both Basic Data. Null when Google can't be asked or doesn't know it. */
export async function findCity(placeId: string): Promise<City | null> {
  const key = serverKey()
  if (!key || !placeId.trim()) return null
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry,address_components,name&key=${key}`
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const data = (await res.json()) as {
      status: string
      result?: { name?: string; geometry?: { location?: { lat?: number; lng?: number } }; address_components?: Component[] }
    }
    if (data.status !== 'OK' || !data.result) return null
    const { lat, lng } = data.result.geometry?.location ?? {}
    if (typeof lat !== 'number' || typeof lng !== 'number') return null
    const parts = data.result.address_components ?? []
    const named = (type: string) => parts.find((c) => c.types?.includes(type))?.long_name
    const city = named('locality') ?? data.result.name
    if (!city) return null
    return { city, area: named('administrative_area_level_1') ?? named('country') ?? '', lat, lng }
  } catch {
    return null
  }
}
