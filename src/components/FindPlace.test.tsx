// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { useListingDraft } from '@/components/resources/useListingDraft'
import { guideMatches } from './FindPlace'

// "Find the place" in the "+ Add" box (Oct 5): the guide's own listings by
// name, and a Google pick that starts the add form already filled in.

describe('guideMatches', () => {
  const listings = ['Trader Joe’s', 'Joe’s Pizza', 'ACME Markets', 'Spruce Market'].map((name, i) => makeListing({ id: String(i), name }))
  it('matches each word typed to the start of a word in the name, ignoring case and apostrophes', () => {
    expect(guideMatches(listings, 'trader j').map((l) => l.name)).toEqual(['Trader Joe’s'])
    expect(guideMatches(listings, 'joes').map((l) => l.name)).toEqual(['Trader Joe’s', 'Joe’s Pizza'])
    expect(guideMatches(listings, 'mark').map((l) => l.name)).toEqual(['ACME Markets', 'Spruce Market'])
    expect(guideMatches(listings, 'arket')).toEqual([])
    expect(guideMatches(listings, 'a')).toEqual([])
  })
})

describe('useListingDraft started from a Google pick', () => {
  const food = makeCategory({
    id: 'restaurant',
    detailFields: [
      { key: 'hours', label: 'Hours', type: 'hours' },
      { key: 'website', label: 'Website', type: 'url' },
    ],
  })
  const place = {
    placeId: 'gp1',
    name: 'Paulie Gee’s',
    phone: '215-555-0142',
    hours: { tue: { open: '17:00', close: '22:00' } },
    website: 'https://pauliegee.example',
    description: null,
    businessStatus: 'OPERATIONAL' as const,
  }

  it('fills in what Google gave, as a pick inside the form does, and records it for the sync', () => {
    const { result } = renderHook(() => useListingDraft(food, makeListing({ address: '1600 N Front St', geo: { lat: 1, lng: 2 } }), place))
    const sub = result.current.buildSubmission()
    expect(sub).toMatchObject({ name: 'Paulie Gee’s', phone: '(215) 555-0142', address: '1600 N Front St', geo: { lat: 1, lng: 2 } })
    expect(sub.details).toMatchObject({
      hours: place.hours,
      website: place.website,
      placeId: 'gp1',
      businessStatus: 'OPERATIONAL',
      googleAutofill: { name: 'Paulie Gee’s', phone: '(215) 555-0142', website: place.website, hours: JSON.stringify(place.hours) },
    })
  })
})
