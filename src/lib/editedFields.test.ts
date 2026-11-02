import { describe, expect, it } from 'vitest'
import { editedFields, onListingNow } from './editedFields'
import type { CategoryField } from './categories'
import type { DirectoryResource, ResourceRow, ResourceSubmission } from '@/types'

const FIELDS: CategoryField[] = [
  { key: 'hours', label: 'Hours', type: 'text' },
  { key: 'kosher', label: 'Kosher', type: 'tags' },
  { key: 'minyanim', label: 'Minyanim', type: 'minyanim' },
]

const row = (over: Partial<ResourceRow> = {}): ResourceRow =>
  ({
    id: 'r1',
    category: 'food',
    name: 'Shalom Pizza',
    anchor_id: 'community',
    distance: 0,
    address: '1 Main St',
    phone: '(215) 555-0100',
    details: { hours: 'Sun–Thu', kosher: ['Keystone-K'], geo: { lat: 1, lng: 2 }, menuUrl: 'https://a.example/menu', businessStatus: 'OPERATIONAL' },
    ...over,
  }) as ResourceRow

const listing = (r: ResourceRow): DirectoryResource => ({ id: r.id, category: r.category, name: r.name, anchorId: r.anchor_id, distance: 0, address: r.address ?? '', phone: r.phone ?? undefined, ...r.details })

const sentFrom = (r: ResourceRow, over: Partial<ResourceSubmission> = {}): ResourceSubmission => ({
  category: r.category,
  name: r.name,
  anchorId: r.anchor_id,
  distance: null,
  address: r.address ?? '',
  phone: r.phone ?? '',
  details: { ...r.details },
  ...over,
})

describe('editedFields', () => {
  it('names only what differs from the listing', () => {
    const r = row()
    expect(editedFields(listing(r), sentFrom(r, { phone: '(215) 555-0123', details: { ...r.details, hours: 'Sun–Fri' } }), FIELDS)).toEqual(['phone', 'hours'])
    expect(editedFields(listing(r), sentFrom(r), FIELDS)).toEqual([])
  })

  it('takes a tags field’s “sometimes” list with it', () => {
    const r = row()
    expect(editedFields(listing(r), sentFrom(r, { details: { ...r.details, kosher: ['OU'] } }), FIELDS)).toEqual(['kosher', 'kosher_sometimes'])
  })
})

describe('onListingNow', () => {
  // Filed against the listing at the time; another edit changed the phone,
  // the hours, the address and the menu link since.
  const then = row()
  const since = row({ phone: '(215) 555-0199', address: '2 Main St', details: { ...then.details, hours: 'Sun–Fri', geo: { lat: 3, lng: 4 }, menuUrl: 'https://b.example/menu' } })
  const sent = { ...sentFrom(then, { name: 'Shalom Pizzeria', geo: { lat: 1, lng: 2 } }), editedFields: ['name'] }

  it('puts its own fields on the listing as it is now, and leaves the rest', () => {
    const out = onListingNow(sent, since, FIELDS)
    expect(out.name).toBe('Shalom Pizzeria')
    expect(out.phone).toBe('(215) 555-0199')
    expect(out.address).toBe('2 Main St')
    expect(out.geo).toEqual({ lat: 3, lng: 4 })
    expect(out.details).toMatchObject({ hours: 'Sun–Fri', menuUrl: 'https://b.example/menu' })
  })

  it('keeps what isn’t a field as sent', () => {
    const out = onListingNow({ ...sent, details: { ...sent.details, businessStatus: 'CLOSED_PERMANENTLY' } }, since, FIELDS)
    expect(out.details.businessStatus).toBe('CLOSED_PERMANENTLY')
  })

  it('keeps a field the admin changed in Edit', () => {
    const out = onListingNow({ ...sent, phone: '(215) 555-0177', reviewEdit: { by: 'a', at: 'b', fields: ['phone'], asSent: {} } } as ResourceSubmission, since, FIELDS)
    expect(out.phone).toBe('(215) 555-0177')
  })

  it('drops a field the listing no longer has', () => {
    const out = onListingNow({ ...sent, details: { ...sent.details, minyanim: [] } }, since, FIELDS)
    expect('minyanim' in out.details).toBe(false)
  })

  it('leaves an edit filed before editedFields as it was sent', () => {
    const old: ResourceSubmission = { ...sent }
    delete old.editedFields
    expect(onListingNow(old, since, FIELDS)).toBe(old)
  })
})
