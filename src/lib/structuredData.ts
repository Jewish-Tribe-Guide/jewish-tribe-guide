import type { CategoryConfig } from './categories'
import { PHOTO_FIELD_KEY } from './categories'
import { DAY_KEYS, businessClosure, type DayKey, type StructuredHours } from './hours'
import { listingSlug } from './listingSlug'
import { routes } from './routes'
import type { DirectoryResource } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// schema.org JSON-LD for the pages people arrive on from a search engine.
//
// This site answers "kosher grocery near the hospital", which is a question
// typed into Google. A listing page already SHOWS its address, hours and phone;
// this states the same facts in a form a crawler doesn't have to guess at, which
// is what makes a page eligible for the richer local results.
//
// Two rules keep it honest:
//
//  - It only restates what the page shows, from the same fields. Google treats
//    markup claiming things the page doesn't display as spam, so nothing is
//    invented: no ratings (an upvote is not a review, and marking it up as one
//    is a known way to get penalized), no cuisine or kosher claims, and no
//    Google-sourced descriptions.
//  - A field that's missing or malformed is left out, never guessed at.
//
// Pure functions, so they're unit-tested without rendering anything. Serialize
// the result with buildJsonLdScript (jsonLdScript.ts), which escapes `<` — an
// admin-edited name containing `</script>` would otherwise close the tag early.
// ─────────────────────────────────────────────────────────────────────────────

type JsonLd = Record<string, unknown>

/** schema.org type per category id. Category ids are admin-defined, so anything
 *  not listed here falls back to LocalBusiness — the generic, valid choice for
 *  "a place a person can go" — rather than guessing. */
const TYPE_BY_CATEGORY: Record<string, string> = {
  synagogue: 'Synagogue',
  grocery: 'GroceryStore',
  // The category is "Food Establishment" — bakeries and caterers as well as
  // restaurants — so the parent type, not Restaurant.
  restaurant: 'FoodEstablishment',
  hotel: 'Hotel',
  cemetery: 'Cemetery',
  childcare: 'ChildCare',
  school: 'School',
}

export function schemaTypeForCategory(categoryId: string): string {
  return TYPE_BY_CATEGORY[categoryId] ?? 'LocalBusiness'
}

const DAY_NAMES: Record<DayKey, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** The structured `hours` value as OpeningHoursSpecification entries. A day that
 *  is null or absent is closed, and simply isn't listed. */
export function openingHoursSpecification(hours: unknown): JsonLd[] {
  if (!hours || typeof hours !== 'object') return []

  const specs: JsonLd[] = []
  for (const key of DAY_KEYS) {
    const day = (hours as StructuredHours)[key]
    if (!day || typeof day !== 'object') continue
    const { open, close } = day
    if (typeof open !== 'string' || typeof close !== 'string') continue
    if (!TIME_RE.test(open) || !TIME_RE.test(close)) continue
    specs.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_NAMES[key], opens: open, closes: close })
  }
  return specs
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

function geoOf(item: DirectoryResource): JsonLd | null {
  const g = item.geo
  if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lng)) return null
  return { '@type': 'GeoCoordinates', latitude: g.lat, longitude: g.lng }
}

/** The category's own field of a given type, e.g. which key holds its hours. */
function fieldKey(category: CategoryConfig, type: string, fallback: string): string {
  return category.detailFields.find((f) => f.type === type)?.key ?? fallback
}

type Crumb = { name: string; url: string }

function breadcrumbList(crumbs: Crumb[]): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  }
}

/** One listing's page: the place itself, and where it sits in the site. */
export function buildListingJsonLd(args: {
  item: DirectoryResource
  category: CategoryConfig
  community: string
  siteName: string
  /** Absolute origin, e.g. https://example.com — see siteUrl(). */
  base: string
}): JsonLd {
  const { item, category, community, siteName, base } = args
  const url = `${base}${routes.listing(community, category.id, listingSlug(item))}`

  const website = httpUrl(item[fieldKey(category, 'url', 'website')])
  const photo = httpUrl(item[PHOTO_FIELD_KEY])
  const geo = geoOf(item)
  // A permanently closed place doesn't keep its opening hours.
  const specs = businessClosure(item) === 'permanent' ? [] : openingHoursSpecification(item[fieldKey(category, 'hours', 'hours')])

  const place: JsonLd = {
    '@type': schemaTypeForCategory(category.id),
    '@id': url,
    name: item.name,
    url,
    ...(item.address ? { address: item.address } : {}),
    ...(item.phone ? { telephone: item.phone } : {}),
    ...(geo ? { geo } : {}),
    ...(photo ? { image: photo } : {}),
    ...(specs.length > 0 ? { openingHoursSpecification: specs } : {}),
    // Their own website is a different thing from this page's URL, which is
    // what `url` above is.
    ...(website ? { sameAs: [website] } : {}),
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      place,
      breadcrumbList([
        { name: siteName, url: `${base}${routes.home(community)}` },
        { name: category.pluralLabel, url: `${base}${routes.slug(community, category.id)}` },
        { name: item.name, url },
      ]),
    ],
  }
}

/** A category directory: the list of its places, and the breadcrumb. */
export function buildCategoryJsonLd(args: {
  category: Pick<CategoryConfig, 'id' | 'pluralLabel'>
  listings: DirectoryResource[]
  community: string
  siteName: string
  base: string
}): JsonLd {
  const { category, listings, community, siteName, base } = args

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: category.pluralLabel,
        numberOfItems: listings.length,
        itemListElement: listings.map((item, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: item.name,
          url: `${base}${routes.listing(community, category.id, listingSlug(item))}`,
        })),
      },
      breadcrumbList([
        { name: siteName, url: `${base}${routes.home(community)}` },
        { name: category.pluralLabel, url: `${base}${routes.slug(community, category.id)}` },
      ]),
    ],
  }
}
