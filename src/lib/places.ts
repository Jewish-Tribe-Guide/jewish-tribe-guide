import type { DirectoryResource } from '@/types'
import { haversineMiles, type LatLng } from '@/lib/geo'
import { words } from '@/lib/ask'

// ── Places a question can be about ───────────────────────────────────────────
// "food in Cherry Hill", "shul near Center City", "sushi around Bala Cynwyd":
// somewhere that isn't a listing, to measure from. Two free sources, no
// lookups: the towns the listings' own addresses name (with the listings'
// own coordinates, so a community gets its towns without anyone entering
// them), and a short hand list of neighborhoods for the communities that
// have one (a city's addresses all just say the city). A street corner
// ("Broad and Washington") would need a geocoding service, and isn't here.

export type Place = {
  name: string
  /** Other ways people say it, as typed: "South Philly". */
  aliases?: string[]
  geo: LatLng
  /** Roughly how far it reaches, in miles: what "in Cherry Hill" keeps. */
  radius: number
}

// Neighborhood centres are approximate on purpose: they only decide what's
// nearest, and every answer measured from one says "about". Keyed by the
// community's slug.
const NEIGHBORHOODS: Record<string, Place[]> = {
  philly: [
    { name: 'Center City', geo: { lat: 39.9524, lng: -75.1636 }, radius: 1.3 },
    { name: 'Rittenhouse', aliases: ['Rittenhouse Square'], geo: { lat: 39.9496, lng: -75.1718 }, radius: 0.6 },
    { name: 'Society Hill', geo: { lat: 39.944, lng: -75.147 }, radius: 0.5 },
    { name: 'Old City', geo: { lat: 39.951, lng: -75.144 }, radius: 0.5 },
    { name: 'Queen Village', geo: { lat: 39.9376, lng: -75.1497 }, radius: 0.5 },
    { name: 'Bella Vista', geo: { lat: 39.94, lng: -75.158 }, radius: 0.4 },
    { name: 'Graduate Hospital', aliases: ['Grad Hospital', 'Southwest Center City'], geo: { lat: 39.942, lng: -75.178 }, radius: 0.6 },
    { name: 'Fairmount', aliases: ['Art Museum'], geo: { lat: 39.967, lng: -75.175 }, radius: 0.7 },
    { name: 'Northern Liberties', geo: { lat: 39.966, lng: -75.142 }, radius: 0.6 },
    { name: 'Fishtown', geo: { lat: 39.973, lng: -75.133 }, radius: 0.8 },
    { name: 'South Philadelphia', aliases: ['South Philly'], geo: { lat: 39.925, lng: -75.169 }, radius: 1.8 },
    { name: 'University City', aliases: ['UCity'], geo: { lat: 39.9522, lng: -75.1932 }, radius: 1 },
    { name: 'West Philadelphia', aliases: ['West Philly'], geo: { lat: 39.96, lng: -75.225 }, radius: 2 },
    { name: 'Northeast Philadelphia', aliases: ['Northeast Philly', 'the Northeast'], geo: { lat: 40.07, lng: -75.05 }, radius: 4 },
    { name: 'Bustleton', geo: { lat: 40.09, lng: -75.04 }, radius: 1.2 },
    { name: 'Rhawnhurst', geo: { lat: 40.06, lng: -75.06 }, radius: 1 },
    { name: 'Manayunk', geo: { lat: 40.026, lng: -75.224 }, radius: 0.8 },
    { name: 'Roxborough', geo: { lat: 40.04, lng: -75.22 }, radius: 1.2 },
    { name: 'Chestnut Hill', geo: { lat: 40.073, lng: -75.208 }, radius: 1 },
    { name: 'Mount Airy', aliases: ['Mt Airy'], geo: { lat: 40.058, lng: -75.19 }, radius: 1 },
    { name: 'Germantown', geo: { lat: 40.037, lng: -75.173 }, radius: 1 },
    { name: 'Overbrook', aliases: ['Overbrook Park'], geo: { lat: 39.982, lng: -75.25 }, radius: 1 },
    { name: 'Wynnefield', geo: { lat: 39.995, lng: -75.225 }, radius: 0.8 },
    { name: 'Lower Merion', geo: { lat: 40.015, lng: -75.27 }, radius: 2.5 },
    { name: 'the Main Line', aliases: ['Main Line'], geo: { lat: 40.01, lng: -75.28 }, radius: 4 },
  ],
}

export function neighborhoodsFor(communitySlug: string | null | undefined): Place[] {
  return (communitySlug && NEIGHBORHOODS[communitySlug]) || []
}

// "…, Cherry Hill Township, NJ 08034, USA": the town, before the state.
const TOWN = /,\s*([^,]+?),\s*[A-Z]{2}\s*\d{5}/

/** "…, Cherry Hill Township, NJ 08034" → "Cherry Hill": the town an address
 *  names, as people say it. */
export function townOf(address: string | null | undefined): string | null {
  const town = address?.match(TOWN)?.[1]?.trim()
  return town ? shortTown(town) : null
}

const shortTown = (town: string) => town.replace(/\s+(Township|Twp\.?|Borough|Boro)$/i, '')

/** Where a listing is, in the words a row uses beside its name: the
 *  tightest description that fits. A neighbourhood it sits in, or the town
 *  its address names, whichever reaches less far: "Rittenhouse" rather than
 *  "Philadelphia", but "Merion Station" rather than "the Main Line", and
 *  "Northeast Philadelphia" rather than "Philadelphia". `towns` is
 *  townsFrom() of the listings around it, which is how far each town
 *  reaches. */
export function placeName(listing: DirectoryResource, neighborhoods: readonly Place[], towns: readonly Place[]): string | null {
  const town = townOf(listing.address)
  const candidates = [
    ...(listing.geo ? neighborhoods.filter((p) => haversineMiles(p.geo, listing.geo!) <= p.radius) : []),
    ...towns.filter((t) => t.name === town),
  ]
  // A neighbourhood first on a tie: it was chosen by hand.
  const best = candidates.reduce<Place | null>((b, p) => (!b || p.radius < b.radius ? p : b), null)
  return best?.name ?? town
}

/** The towns the listings' addresses name, each placed at the middle of its
 *  own listings and reaching as far as they do. "Cherry Hill Township" is
 *  also just "Cherry Hill", which is what people say. */
export function townsFrom(listings: readonly DirectoryResource[]): Place[] {
  const byTown = new Map<string, LatLng[]>()
  for (const l of listings) {
    const town = l.address?.match(TOWN)?.[1]?.trim()
    if (!town || !l.geo) continue
    byTown.set(town, [...(byTown.get(town) ?? []), l.geo])
  }
  return [...byTown].map(([town, geos]) => {
    const geo = { lat: geos.reduce((s, g) => s + g.lat, 0) / geos.length, lng: geos.reduce((s, g) => s + g.lng, 0) / geos.length }
    const reach = Math.max(...geos.map((g) => haversineMiles(geo, g)))
    const short = shortTown(town)
    return { name: short, aliases: short !== town ? [town] : undefined, geo, radius: Math.max(1.5, reach + 0.5) }
  })
}

const WHERE_WORDS = new Set(['in', 'within', 'near', 'by', 'around', 'at', 'to', 'from', 'nearby'])

export type PlaceMatch = {
  place: Place
  /** "in Cherry Hill", as against "near" it: only what's within it. */
  inside: boolean
  /** Said with a where-word ("in", "near", "by"…), so it's surely a place,
   *  even if a listing shares the name (Cherry Hill Cookies). */
  introduced: boolean
  /** The question's words the place used up, folded. */
  used: string[]
}

/** The place a question names, if it names one: the longest place name (or
 *  alias) whose words appear together in it. "in" just before it means
 *  inside it; anything else ("near", "by", nothing) means measured from it. */
export function findPlace(raw: string, places: readonly Place[]): PlaceMatch | null {
  const said = words(raw)
  let best: PlaceMatch | null = null
  for (const place of places) {
    for (const name of [place.name, ...(place.aliases ?? [])]) {
      const nameWords = words(name).filter((w) => w !== 'the')
      if (nameWords.length === 0 || (best && nameWords.length <= best.used.length)) continue
      const at = said.findIndex((_, i) => nameWords.every((w, j) => said[i + j] === w))
      if (at < 0) continue
      const before = said[at - 1] === 'the' ? said[at - 2] : said[at - 1]
      best = { place, inside: before === 'in' || before === 'within', introduced: WHERE_WORDS.has(before ?? ''), used: nameWords }
    }
  }
  return best
}
