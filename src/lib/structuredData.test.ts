import { describe, expect, it } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { buildJsonLdScript } from './jsonLdScript'
import { listingSlug } from './listingSlug'
import {
  buildCategoryJsonLd,
  buildListingJsonLd,
  openingHoursSpecification,
  schemaTypeForCategory,
} from './structuredData'

const BASE = 'https://example.com'
const grocery = makeCategory({
  id: 'grocery',
  pluralLabel: 'Grocery Stores',
  detailFields: [
    { key: 'hours', type: 'hours', label: 'Hours', renderAs: 'row' },
    { key: 'website', type: 'url', label: 'Website', renderAs: 'row' },
  ],
})

function place(overrides: Record<string, unknown> = {}, category = grocery) {
  const item = makeListing({
    id: 'a1b2c3d4-0000-0000-0000-000000000000',
    category: category.id,
    name: 'Goldi Market',
    address: '123 Main St, Philadelphia, PA',
    phone: '215-555-0100',
    geo: { lat: 39.95, lng: -75.16 },
    hours: { mon: { open: '09:00', close: '17:00' }, tue: null },
    website: 'https://goldi.example/',
    ...overrides,
  })
  const ld = buildListingJsonLd({ item, category, community: 'philly', siteName: 'Philly Guide', base: BASE })
  const graph = ld['@graph'] as Record<string, unknown>[]
  return { ld, place: graph[0]!, crumbs: graph[1]!, item }
}

describe('schemaTypeForCategory', () => {
  it.each([
    ['synagogue', 'Synagogue'],
    ['grocery', 'GroceryStore'],
    ['restaurant', 'FoodEstablishment'],
    ['hotel', 'Hotel'],
    ['cemetery', 'Cemetery'],
  ])('%s -> %s', (id, type) => {
    expect(schemaTypeForCategory(id)).toBe(type)
  })

  it('falls back to LocalBusiness for an admin-defined category it does not know', () => {
    expect(schemaTypeForCategory('mikvah')).toBe('LocalBusiness')
    expect(schemaTypeForCategory('kosher-butchers')).toBe('LocalBusiness')
  })
})

describe('openingHoursSpecification', () => {
  it('lists open days with their times, and skips closed (null) and absent days', () => {
    expect(
      openingHoursSpecification({
        mon: { open: '09:00', close: '17:00' },
        tue: null,
        fri: { open: '08:30', close: '14:00' },
      }),
    ).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Monday', opens: '09:00', closes: '17:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Friday', opens: '08:30', closes: '14:00' },
    ])
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a free-text string', 'Mon-Fri 9-5'],
    ['a number', 5],
    ['an empty object', {}],
  ])('yields nothing for %s', (_n, value) => {
    expect(openingHoursSpecification(value)).toEqual([])
  })

  it('drops a day with a malformed time rather than publishing a guess', () => {
    expect(
      openingHoursSpecification({
        mon: { open: '9am', close: '5pm' },
        tue: { open: '25:00', close: '17:00' },
        wed: { open: '09:00' },
        thu: { open: '09:00', close: '17:00' },
      }),
    ).toEqual([{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'Thursday', opens: '09:00', closes: '17:00' }])
  })
})

describe('buildListingJsonLd', () => {
  it('states the listing\'s own facts under its own friendly URL', () => {
    const { ld, place: p, item } = place()
    const url = `${BASE}/philly/grocery/${listingSlug(item)}`

    expect(ld['@context']).toBe('https://schema.org')
    expect(p).toMatchObject({
      '@type': 'GroceryStore',
      '@id': url,
      url,
      name: 'Goldi Market',
      address: '123 Main St, Philadelphia, PA',
      telephone: '215-555-0100',
      geo: { '@type': 'GeoCoordinates', latitude: 39.95, longitude: -75.16 },
      sameAs: ['https://goldi.example/'],
    })
    expect(p.openingHoursSpecification).toHaveLength(1)
  })

  it('leaves out everything the listing does not have, instead of emitting empties', () => {
    const { place: p } = place({ phone: undefined, geo: undefined, hours: undefined, website: undefined, address: '' })

    for (const key of ['telephone', 'geo', 'openingHoursSpecification', 'sameAs', 'address', 'image']) {
      expect(p, key).not.toHaveProperty(key)
    }
    expect(p).toMatchObject({ name: 'Goldi Market' })
  })

  it('ignores a coordinate that is not a real number', () => {
    expect(place({ geo: { lat: NaN, lng: 5 } }).place).not.toHaveProperty('geo')
  })

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['not a URL', 'goldi dot com'],
    ['a non-string', 42],
  ])('never publishes a website that is %s', (_n, website) => {
    expect(place({ website }).place).not.toHaveProperty('sameAs')
  })

  it('uses the listing photo when it is an http(s) URL', () => {
    expect(place({ photo: 'https://cdn.example/p.jpg' }).place.image).toBe('https://cdn.example/p.jpg')
    expect(place({ photo: 'data:image/png;base64,AAAA' }).place).not.toHaveProperty('image')
  })

  it('reads hours and website from whichever fields the category says hold them', () => {
    const custom = makeCategory({
      id: 'bakery',
      detailFields: [
        { key: 'opening_times', type: 'hours', label: 'Opening times', renderAs: 'row' },
        { key: 'site', type: 'url', label: 'Site', renderAs: 'row' },
      ],
    })
    const { place: p } = place(
      { hours: undefined, opening_times: { sun: { open: '07:00', close: '12:00' } }, website: undefined, site: 'https://b.example/' },
      custom,
    )
    expect(p.openingHoursSpecification).toHaveLength(1)
    expect(p.sameAs).toEqual(['https://b.example/'])
  })

  it('drops opening hours for a permanently closed place, but keeps them for a temporary closure', () => {
    expect(place({ businessStatus: 'CLOSED_PERMANENTLY' }).place).not.toHaveProperty('openingHoursSpecification')
    expect(place({ businessStatus: 'CLOSED_TEMPORARILY' }).place).toHaveProperty('openingHoursSpecification')
    // An admin override wins over Google's status, same as everywhere else.
    expect(
      place({ businessStatus: 'CLOSED_PERMANENTLY', businessStatusOverride: 'OPERATIONAL' }).place,
    ).toHaveProperty('openingHoursSpecification')
  })

  it('never claims a rating: an upvote is not a review', () => {
    const { place: p } = place({ upvotes: 12 })
    expect(JSON.stringify(p)).not.toMatch(/rating|review/i)
  })

  it('builds the breadcrumb: site, category, then the listing', () => {
    const { crumbs, item } = place()
    expect(crumbs).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Philly Guide', item: `${BASE}/philly` },
        { '@type': 'ListItem', position: 2, name: 'Grocery Stores', item: `${BASE}/philly/grocery` },
        { '@type': 'ListItem', position: 3, name: 'Goldi Market', item: `${BASE}/philly/grocery/${listingSlug(item)}` },
      ],
    })
  })

  it('cannot break out of its <script> tag, however hostile the listing name', () => {
    const { ld } = place({ name: '</script><script>alert(1)</script>' })
    const html = buildJsonLdScript(ld)

    expect(html).not.toContain('</script>')
    expect(html).not.toContain('<')
    // ...and a consumer still reads the original text back.
    const back = JSON.parse(html) as { '@graph': { name: string }[] }
    expect(back['@graph'][0]!.name).toBe('</script><script>alert(1)</script>')
  })
})

describe('buildCategoryJsonLd', () => {
  const listings = [
    makeListing({ id: 'aaaaaaaa-0000-0000-0000-000000000000', name: 'Alpha Foods' }),
    makeListing({ id: 'bbbbbbbb-0000-0000-0000-000000000000', name: 'Beta Market' }),
  ]

  it('lists every place, in order, by the URL of its own page', () => {
    const ld = buildCategoryJsonLd({ category: grocery, listings, community: 'philly', siteName: 'Philly Guide', base: BASE })
    const [list, crumbs] = ld['@graph'] as Record<string, unknown>[]

    expect(list).toMatchObject({ '@type': 'ItemList', name: 'Grocery Stores', numberOfItems: 2 })
    expect(list!.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Alpha Foods', url: `${BASE}/philly/grocery/${listingSlug(listings[0]!)}` },
      { '@type': 'ListItem', position: 2, name: 'Beta Market', url: `${BASE}/philly/grocery/${listingSlug(listings[1]!)}` },
    ])
    expect((crumbs as { itemListElement: unknown[] }).itemListElement).toHaveLength(2)
  })
})
