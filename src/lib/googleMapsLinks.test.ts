import { describe, expect, it } from 'vitest'
import { businessUrl, directionsUrl, searchNearUrl } from './googleMapsLinks'

// These URLs are the handoff to live turn-by-turn navigation — the one thing
// this app deliberately doesn't try to do itself. A malformed one doesn't throw;
// it opens Google Maps on the wrong place, or on nothing, which is only ever
// noticed by the person standing outside a hospital trying to get somewhere.

const params = (url: string) => new URL(url).searchParams

describe('directionsUrl', () => {
  it('sends an address to turn-by-turn directions', () => {
    const url = directionsUrl('7594 Haverford Ave, Philadelphia, PA')
    expect(url).toContain('/maps/dir/')
    expect(params(url).get('destination')).toBe('7594 Haverford Ave, Philadelphia, PA')
  })

  it('falls back to coordinates when there is no address', () => {
    expect(params(directionsUrl({ lat: 39.96, lng: -75.21 })).get('destination')).toBe('39.96,-75.21')
  })

  it('escapes an address so a & or # cannot truncate the destination', () => {
    const url = directionsUrl('100 Broad & Main #4')
    expect(url).not.toContain(' ')
    expect(params(url).get('destination')).toBe('100 Broad & Main #4')
  })

  it('uses the documented api=1 form, which is what opens the native app', () => {
    expect(params(directionsUrl('anywhere')).get('api')).toBe('1')
  })
})

describe('businessUrl', () => {
  it('searches by name and address together', () => {
    expect(params(businessUrl('Maadan', '7594 Haverford Ave')).get('query')).toBe('Maadan 7594 Haverford Ave')
  })

  it('works from a name alone', () => {
    expect(params(businessUrl('Maadan')).get('query')).toBe('Maadan')
    expect(params(businessUrl('Maadan', null)).get('query')).toBe('Maadan')
  })

  // Without the place id, two shops with the same name open the wrong one.
  it('pins the exact place when a placeId is known', () => {
    const url = businessUrl('Maadan', '7594 Haverford Ave', 'ChIJabc123')
    expect(params(url).get('query_place_id')).toBe('ChIJabc123')
  })

  it('omits the place id rather than sending an empty one', () => {
    expect(params(businessUrl('Maadan', null, null)).has('query_place_id')).toBe(false)
    expect(params(businessUrl('Maadan', null, '')).has('query_place_id')).toBe(false)
  })

  it('escapes the query', () => {
    expect(params(businessUrl('Ben & Jerry’s', 'Broad & Main')).get('query')).toBe('Ben & Jerry’s Broad & Main')
  })
})

describe('searchNearUrl', () => {
  it('centres the search on the visitor when their location is known', () => {
    expect(params(searchNearUrl('kosher grocery', { lat: 39.96, lng: -75.21 })).get('query')).toBe(
      'kosher grocery near 39.96,-75.21',
    )
  })

  it('sends a plain search when the location is unknown, rather than nothing', () => {
    expect(params(searchNearUrl('kosher grocery')).get('query')).toBe('kosher grocery')
    expect(params(searchNearUrl('kosher grocery', null)).get('query')).toBe('kosher grocery')
  })

  it('sends exactly one query parameter', () => {
    const url = searchNearUrl('kosher grocery', { lat: 39.96, lng: -75.21 })
    expect(url.match(/[?&]query=/g)).toHaveLength(1)
  })
})

describe('every builder', () => {
  const urls = [
    directionsUrl('7594 Haverford Ave'),
    directionsUrl({ lat: 39.96, lng: -75.21 }),
    businessUrl('Maadan', '7594 Haverford Ave', 'ChIJabc123'),
    searchNearUrl('kosher grocery', { lat: 39.96, lng: -75.21 }),
  ]

  it('produces an absolute https URL to Google Maps', () => {
    for (const url of urls) {
      const parsed = new URL(url)
      expect(parsed.protocol).toBe('https:')
      expect(parsed.hostname).toBe('www.google.com')
      expect(parsed.pathname).toMatch(/^\/maps\//)
    }
  })
})
