import { describe, expect, it } from 'vitest'
import { listingSearchText } from './searchListing'
import type { CategoryConfig, CategoryField } from './categories'
import type { DirectoryResource } from '@/types'

// The landing-page "Places" search and every category directory's own search box
// share this function so the two can't drift — a listing findable from the home
// screen must stay findable inside its own directory. The `undefined` category
// path matters just as much as the configured one: that's what the landing
// search uses before the category config has loaded.

const field = (key: string, type: CategoryField['type']): CategoryField => ({
  key,
  label: key,
  type,
})

const category = (fields: CategoryField[]): CategoryConfig => ({
  id: 'restaurant',
  label: 'Food Establishment',
  pluralLabel: 'Food Establishments',
  icon: '🍽️',
  description: '',
  kind: 'listing',
  detailFields: fields,
})

const listing = (extra: Record<string, unknown> = {}): DirectoryResource => ({
  id: '1',
  category: 'restaurant',
  name: 'Maadan',
  anchorId: 'community',
  distance: 0,
  address: '7594 Haverford Ave',
  ...extra,
})

describe('listingSearchText', () => {
  it('always covers the name and address', () => {
    const text = listingSearchText(listing())
    expect(text).toContain('maadan')
    expect(text).toContain('haverford')
  })

  it('lowercases everything, so the caller can compare against a lowercased query', () => {
    expect(listingSearchText(listing({ name: 'MAADAN' }))).toBe(listingSearchText(listing({ name: 'maadan' })))
  })

  it('survives a listing with no address', () => {
    expect(() => listingSearchText(listing({ address: '' }))).not.toThrow()
    expect(listingSearchText(listing({ address: '' }))).toContain('maadan')
  })

  describe('with the category config known', () => {
    it('includes tag values and their _sometimes companion', () => {
      const text = listingSearchText(
        listing({ kosherTags: ['Dairy'], kosherTags_sometimes: ['Pareve'] }),
        category([field('kosherTags', 'tags')]),
      )
      expect(text).toContain('dairy')
      expect(text).toContain('pareve')
    })

    it('includes a select field whether it holds one value or several', () => {
      const config = category([field('type', 'select')])
      expect(listingSearchText(listing({ type: 'Restaurant' }), config)).toContain('restaurant')
      expect(listingSearchText(listing({ type: ['Restaurant', 'Catering'] }), config)).toContain('catering')
    })

    it('includes text and textarea details', () => {
      const text = listingSearchText(
        listing({ hechsher: 'Keystone K', notes: 'Closed for Pesach' }),
        category([field('hechsher', 'text'), field('notes', 'textarea')]),
      )
      expect(text).toContain('keystone')
      expect(text).toContain('pesach')
    })

    // Searching a phone number or a URL matches listings nobody meant to find,
    // and hours/minyanim are structured objects that would stringify to noise.
    it('leaves out field types that are not text a visitor would search for', () => {
      const text = listingSearchText(
        listing({ phone2: '215-555-0100', link: 'https://example.com', open: true, seats: 42 }),
        category([
          field('phone2', 'tel'),
          field('link', 'url'),
          field('open', 'boolean'),
          field('seats', 'number'),
        ]),
      )
      expect(text).not.toContain('215')
      expect(text).not.toContain('example.com')
      expect(text).not.toContain('42')
    })

    it('ignores a declared field the listing does not have', () => {
      expect(() =>
        listingSearchText(listing(), category([field('missing', 'tags'), field('alsoMissing', 'select')])),
      ).not.toThrow()
    })
  })

  describe('without the category config', () => {
    it('still finds tag values, so the landing search works before config loads', () => {
      const text = listingSearchText(listing({ kosherTags: ['Dairy', 'Cholov Yisroel'] }))
      expect(text).toContain('cholov yisroel')
    })

    it('does not choke on a non-string array', () => {
      expect(() => listingSearchText(listing({ geo: { lat: 1, lng: 2 }, counts: [1, 2, 3] }))).not.toThrow()
    })
  })

  it('finds a tag the same way with and without the config', () => {
    const item = listing({ kosherTags: ['Cholov Yisroel'] })
    const withConfig = listingSearchText(item, category([field('kosherTags', 'tags')]))
    const withoutConfig = listingSearchText(item)
    expect(withConfig).toContain('cholov yisroel')
    expect(withoutConfig).toContain('cholov yisroel')
  })
})
