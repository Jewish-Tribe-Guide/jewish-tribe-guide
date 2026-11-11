import { describe, expect, it } from 'vitest'
import type { CategoryConfig } from './categories'
import { ERUV_FIELDS, eruvPageOwnFields, eruvValues, fullestEruv, ownEruvFields, readEruvDetails, withEruvFields } from './eruvFields'

// Nov 9: the Eruv page has Fields like every page. Never saved, it has the
// four rows an eruv always had; a field an admin makes is kept in the
// eruv's `details`.

const page = (over: Partial<CategoryConfig> = {}): CategoryConfig => ({ id: 'eruv-information', label: 'Eruv', pluralLabel: 'Eruv', icon: '', description: '', detailFields: [], kind: 'eruv', ...over })
const certified = { key: 'certifiedBy', label: 'Certified by', type: 'text' as const }

describe('withEruvFields', () => {
  it('a page never saved has the four rows, Where it goes in a box of its own, and no address or phone', () => {
    const shown = withEruvFields(page({ hasAddress: true, hasPhone: true }))
    expect(shown.detailFields.map((f) => f.key)).toEqual(['covers', 'website', 'hotline', 'alertsUrl'])
    expect(shown.listingParts).toEqual({ boxes: [{ title: 'Where it goes', fields: ['covers'] }] })
    expect(shown).toMatchObject({ hasAddress: false, hasPhone: false })
  })

  it('a saved page keeps its own fields and boxes', () => {
    const saved = page({ detailFields: [ERUV_FIELDS[1]!, certified], listingParts: null })
    expect(withEruvFields(saved).detailFields).toEqual([ERUV_FIELDS[1], certified])
    expect(withEruvFields(saved).listingParts).toBeNull()
  })

  it('leaves any other page as it is', () => {
    const shuls = page({ kind: 'listing', hasAddress: true })
    expect(withEruvFields(shuls)).toBe(shuls)
  })
})

describe('the page’s own fields', () => {
  it('are the ones that aren’t an eruv’s columns, of a kind an eruv takes, and not hidden', () => {
    const fields = [...ERUV_FIELDS, certified, { key: 'photo', label: 'Photo', type: 'image' as const }, { key: 'old', label: 'Old', type: 'text' as const, renderAs: 'hidden' as const }]
    expect(ownEruvFields(fields)).toEqual([certified])
  })

  it('come from a community’s Eruv page, and are none without one', () => {
    expect(eruvPageOwnFields([page({ kind: 'listing', detailFields: [certified] }), page({ detailFields: [certified] })])).toEqual([certified])
    expect(eruvPageOwnFields([page({ kind: 'listing', detailFields: [certified] })])).toEqual([])
    // Never saved: the four rows, none its own.
    expect(eruvPageOwnFields([page()])).toEqual([])
  })
})

describe('eruvValues', () => {
  it('its columns, and what it keeps for the page’s own fields; a column always wins', () => {
    expect(eruvValues({ covers: 'Center City.', website: null, hotline: '215', alertsUrl: null, details: { certifiedBy: 'Rabbi A', hotline: 'not this' } })).toEqual({
      certifiedBy: 'Rabbi A',
      covers: 'Center City.',
      website: null,
      hotline: '215',
      alertsUrl: null,
    })
  })
})

describe('readEruvDetails', () => {
  it('keeps short text, a yes and a few choices, by a field’s key; drops the rest', () => {
    expect(readEruvDetails({ certifiedBy: '  Rabbi A ', open: true, closed: false, empty: '  ', picks: ['a', '', 'b'], count: 3, 'bad key': 'x', hotline: '215', nested: { a: 1 } })).toEqual({
      certifiedBy: 'Rabbi A',
      open: true,
      picks: ['a', 'b'],
      count: '3',
    })
  })

  it('cuts what’s far too long, and isn’t an object’s is null', () => {
    expect(readEruvDetails({ note: 'x'.repeat(900) })!.note).toHaveLength(600)
    expect(readEruvDetails('text')).toBeNull()
    expect(readEruvDetails(['a'])).toBeNull()
  })
})

// The preview's A listing and Editing tabs open one eruv, as a listing
// page's open its most filled-in place.
describe('fullestEruv', () => {
  const e = (id: string, over: Record<string, unknown> = {}) => ({ id, covers: null, website: null, hotline: null, alertsUrl: null, details: {}, ...over })
  const eruvPage: CategoryConfig = { id: 'eruv', label: 'Eruv', pluralLabel: 'Eruv', icon: '', description: '', detailFields: [], kind: 'eruv' }

  it('picks the eruv holding the most of the page’s fields, the first on ties', () => {
    const eruvim = [e('a', { covers: 'x' }), e('b', { covers: 'x', website: 'https://b.org' }), e('c', { covers: 'x', hotline: '1' })]
    expect(fullestEruv(eruvim, eruvPage)!.id).toBe('b')
  })

  it('counts the page’s own fields from details, and not a field the page doesn’t have', () => {
    const page = { ...eruvPage, detailFields: [{ key: 'certifiedBy', label: 'Certified by', type: 'text' as const }] }
    const eruvim = [e('a', { covers: 'x', website: 'https://a.org' }), e('b', { details: { certifiedBy: 'Rabbi A' } })]
    expect(fullestEruv(eruvim, page)!.id).toBe('b')
  })

  it('is null with no eruvim', () => {
    expect(fullestEruv([], eruvPage)).toBeNull()
  })
})
