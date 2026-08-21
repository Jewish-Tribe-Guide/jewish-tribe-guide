import { describe, expect, it } from 'vitest'
import { hasListingChanged } from './listingDiff'
import type { CategoryField } from './categories'
import type { DirectoryResource } from '@/types'

function listing(overrides: Partial<DirectoryResource> = {}): DirectoryResource {
  return {
    id: 'r1',
    category: 'grocery',
    name: 'Kosher Mart',
    anchorId: 'community',
    distance: 1,
    address: '1 Main St',
    phone: '215-555-0100',
    ...overrides,
  }
}

const kosherItemsField: CategoryField = { key: 'kosherItems', label: 'Kosher items', type: 'text' }
const tagsField: CategoryField = { key: 'tags', label: 'Tags', type: 'tags' }

describe('hasListingChanged', () => {
  it('is always a change when there is no existing listing to compare against', () => {
    expect(hasListingChanged(null, { name: 'x', address: '', phone: '', details: {} }, [])).toBe(true)
  })

  it('is not a change when name/address/phone/details all match the existing listing exactly', () => {
    const existing = listing()
    const proposed = { name: existing.name, address: existing.address, phone: existing.phone!, details: {} }
    expect(hasListingChanged(existing, proposed, [])).toBe(false)
  })

  it('is not a change when only whitespace differs', () => {
    const existing = listing({ name: 'Kosher Mart' })
    const proposed = { name: '  Kosher Mart  ', address: existing.address, phone: existing.phone!, details: {} }
    expect(hasListingChanged(existing, proposed, [])).toBe(false)
  })

  it('is a change when the name differs', () => {
    const existing = listing({ name: 'Kosher Mart' })
    const proposed = { name: 'Kosher Market', address: existing.address, phone: existing.phone!, details: {} }
    expect(hasListingChanged(existing, proposed, [])).toBe(true)
  })

  it('is a change when a detail field differs', () => {
    const existing = listing({ kosherItems: 'Bread' })
    const proposed = {
      name: existing.name,
      address: existing.address,
      phone: existing.phone!,
      details: { kosherItems: 'Bread, Milk' },
    }
    expect(hasListingChanged(existing, proposed, [kosherItemsField])).toBe(true)
  })

  it('is not a change when a detail field was typed and then reverted to the exact original value', () => {
    const existing = listing({ kosherItems: 'Bread' })
    const proposed = {
      name: existing.name,
      address: existing.address,
      phone: existing.phone!,
      details: { kosherItems: 'Bread' },
    }
    expect(hasListingChanged(existing, proposed, [kosherItemsField])).toBe(false)
  })

  it('compares a tags field\'s companion "_sometimes" array too', () => {
    const existing = listing({ tags: ['Dairy'], tags_sometimes: ['Meat'] })
    const unchanged = {
      name: existing.name,
      address: existing.address,
      phone: existing.phone!,
      details: { tags: ['Dairy'], tags_sometimes: ['Meat'] },
    }
    expect(hasListingChanged(existing, unchanged, [tagsField])).toBe(false)

    const changed = { ...unchanged, details: { tags: ['Dairy'], tags_sometimes: ['Fish'] } }
    expect(hasListingChanged(existing, changed, [tagsField])).toBe(true)
  })

  it('ignores fields not in the category\'s detailFields (e.g. transient placeId/googleAutofill)', () => {
    const existing = listing()
    const proposed = {
      name: existing.name,
      address: existing.address,
      phone: existing.phone!,
      details: { placeId: 'some-place-id', googleAutofill: { name: 'x' } },
    }
    expect(hasListingChanged(existing, proposed, [])).toBe(false)
  })
})
