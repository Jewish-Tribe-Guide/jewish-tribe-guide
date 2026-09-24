import { describe, expect, it } from 'vitest'
import { changedHoursDays, hasListingChanged, listingChanges, sameFieldValue } from './listingDiff'
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

// What the editor counts as a change. Each rule is here because the
// opposite would put a false "1 change" on the screen — the count only
// works if it never claims a change nobody made.
describe('sameFieldValue', () => {
  it('compares addresses as places, not as the exact string the picker returned', () => {
    expect(sameFieldValue('address', '1324 Arch St, Philadelphia, PA 19107', '1324 Arch Street, Philadelphia, PA 19107, USA')).toBe(true)
    expect(sameFieldValue('address', '1324 Arch St, Philadelphia', '1330 Arch St, Philadelphia')).toBe(false)
  })

  it('compares phone numbers by their digits', () => {
    expect(sameFieldValue('phone', '(215) 563-2170', '215-563-2170')).toBe(true)
    expect(sameFieldValue('tel', '2155632170', '(215) 563-2171')).toBe(false)
  })

  it('compares links by where they go, not how the scheme was typed', () => {
    expect(sameFieldValue('url', 'example.com', 'https://www.example.com/')).toBe(true)
    expect(sameFieldValue('url', 'example.com', 'example.org')).toBe(false)
  })

  it('treats an unset yes/no as "No"', () => {
    expect(sameFieldValue('boolean', undefined, false)).toBe(true)
    expect(sameFieldValue('boolean', undefined, true)).toBe(false)
  })

  it('ignores order in tags and multi-choice badges, and a bare string versus a one-item list', () => {
    expect(sameFieldValue('tags', ['Challah', 'Milk'], ['Milk', 'Challah'])).toBe(true)
    expect(sameFieldValue('select', ['meat', 'parve'], ['parve', 'meat'])).toBe(true)
    expect(sameFieldValue('select', 'parve', ['parve'])).toBe(true)
    expect(sameFieldValue('select', ['parve'], ['dairy'])).toBe(false)
  })

  it('compares hours day by day, a missing day meaning closed', () => {
    const open = { open: '09:00', close: '17:00' }
    expect(sameFieldValue('hours', { mon: open, tue: null }, { mon: open })).toBe(true)
    expect(sameFieldValue('hours', { mon: open }, { mon: { open: '09:00', close: '15:00' } })).toBe(false)
    // Nothing set is different from "closed every day": the listing shows
    // no hours line at all for the first, "Closed today" for the second.
    expect(sameFieldValue('hours', undefined, {})).toBe(false)
  })

  it('compares structured values (minyanim) regardless of key order', () => {
    expect(sameFieldValue('minyanim', [{ name: 'Shacharis', time: '07:00' }], [{ time: '07:00', name: 'Shacharis' }])).toBe(true)
    expect(sameFieldValue('minyanim', [{ name: 'Shacharis', time: '07:00' }], [{ name: 'Shacharis', time: '07:15' }])).toBe(false)
  })
})

describe('changedHoursDays', () => {
  it('lists the days that differ, in week order', () => {
    const open = { open: '11:30', close: '22:00' }
    expect(changedHoursDays({ sun: open, mon: open, fri: open }, { sun: open, mon: null, fri: { open: '11:30', close: '15:00' } })).toEqual(['mon', 'fri'])
  })
})

describe('listingChanges', () => {
  const kashrus: CategoryField = {
    key: 't',
    label: 'Kashrus',
    type: 'select',
    multiSelect: true,
    options: [
      { value: 'parve', label: 'Parve' },
      { value: 'dairy', label: 'Dairy' },
    ],
  }
  const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours' }
  const open = { open: '11:30', close: '22:00' }

  it('reports only what changed, in listing order, with a line for the summary', () => {
    const existing = listing({ phone: '(267) 606-6612', t: ['parve'], hours: { mon: open, tue: open } })
    const changes = listingChanges(
      existing,
      { name: 'Kosher Mart', address: '1 Main St', phone: '(267) 606-6613', details: { t: ['dairy'], hours: { mon: null, tue: open } } },
      [kashrus, hours],
    )
    expect(changes.map((c) => [c.key, c.summary])).toEqual([
      ['phone', '(267) 606-6612 → (267) 606-6613'],
      ['t', 'Parve → Dairy'],
      ['hours', 'Monday → Closed'],
    ])
  })

  it('reports nothing for an edit that only reformats', () => {
    const existing = listing({ phone: '215-555-0100', t: ['parve'] })
    expect(
      listingChanges(existing, { name: ' Kosher Mart ', address: '1 Main Street', phone: '(215) 555-0100', details: { t: 'parve' } }, [kashrus]),
    ).toEqual([])
  })

  it('folds a tags field\'s "sometimes" list into that field\'s one change', () => {
    const existing = listing({ tags: ['Challah'], tags_sometimes: ['Steak'] })
    const changes = listingChanges(
      existing,
      { name: 'Kosher Mart', address: '1 Main St', phone: '215-555-0100', details: { tags: ['Challah', 'Milk'], tags_sometimes: [] } },
      [tagsField],
    )
    expect(changes).toHaveLength(1)
    expect(changes[0].summary).toBe('+ Milk · − ~Steak')
  })

  it('describes an inverted yes/no by the answer it displays', () => {
    const everythingKosher: CategoryField = { key: 'kosherPartial', label: 'Everything here is kosher?', type: 'boolean', invertDisplay: true }
    const changes = listingChanges(
      listing({ kosherPartial: true }),
      { name: 'Kosher Mart', address: '1 Main St', phone: '215-555-0100', details: { kosherPartial: false } },
      [everythingKosher],
    )
    expect(changes[0].summary).toBe('No → Yes')
  })
})
