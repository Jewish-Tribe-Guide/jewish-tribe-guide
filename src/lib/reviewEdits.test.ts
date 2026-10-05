import { describe, expect, it } from 'vitest'
import type { ResourceSubmission } from '@/types'
import type { CategoryField } from './categories'
import { withReviewEdits } from './reviewEdits'

const fields = [
  { key: 'hours', label: 'Hours', type: 'hours' },
  { key: 'items', label: 'Items', type: 'tags' },
  { key: 'minyanim', label: 'Minyanim', type: 'minyanim' },
] as CategoryField[]

const sent: ResourceSubmission = {
  category: 'grocery',
  name: 'Trader Joes',
  anchorId: 'all',
  distance: null,
  address: '1324 Arch St',
  phone: '',
  details: { items: ['Beef'], items_sometimes: [], placeId: 'abc', businessStatus: 'OPERATIONAL' },
  geo: { lat: 1, lng: 2 },
  submittedBy: { name: 'Dana' },
}

const edit = (over: Record<string, unknown>) => withReviewEdits(sent, { ...sent, ...over, details: { ...sent.details, ...(over.details as object) } }, fields, 'admin@x.co', '2026-10-05T10:00:00Z')

describe('withReviewEdits', () => {
  it('applies the admin’s fixes and records what the suggestion said', () => {
    const out = edit({ name: 'Trader Joe’s', details: { items: ['Ground beef'] } })!
    expect(out.name).toBe('Trader Joe’s')
    expect(out.details.items).toEqual(['Ground beef'])
    expect(out).toMatchObject({
      reviewEdit: { by: 'admin@x.co', at: '2026-10-05T10:00:00Z', fields: ['name', 'items'], asSent: { name: 'Trader Joes', items: ['Beef'] } },
    })
    // The rest as sent.
    expect(out.address).toBe('1324 Arch St')
    expect(out.geo).toEqual({ lat: 1, lng: 2 })
    expect(out.submittedBy).toEqual({ name: 'Dana' })
  })

  it('returns the suggestion untouched, with no record, when nothing changed', () => {
    expect(edit({})).toBe(sent)
  })

  // An edit can't move a listing to another category, re-point it at
  // another Google place, or carry keys its form doesn't have.
  it('never takes the category, Google’s fields, a source or unknown keys from the admin’s copy', () => {
    const out = edit({ category: 'restaurant', source: { readBy: 'ai' }, details: { placeId: 'evil', businessStatus: 'CLOSED_PERMANENTLY', secret: 1 } })!
    expect(out).toBe(sent)
  })

  it('takes a field’s companion keys: a store’s “sometimes” items and a shul’s schedules', () => {
    expect(edit({ details: { items_sometimes: ['Wine'] } })!.details.items_sometimes).toEqual(['Wine'])
    expect(edit({ details: { minyanim_schedules: [{ name: 'Sukkos' }] } })!.details.minyanim_schedules).toEqual([{ name: 'Sukkos' }])
  })

  it('drops the old coordinates when the address moves, unless new ones came with it', () => {
    expect(edit({ address: '2121 Market St' })!.geo).toBeNull()
    expect(edit({ address: '2121 Market St', geo: { lat: 3, lng: 4 } })!.geo).toEqual({ lat: 3, lng: 4 })
  })

  it('refuses a copy that isn’t a listing', () => {
    expect(withReviewEdits(sent, null, fields, 'a', 'b')).toBeNull()
    expect(withReviewEdits(sent, { name: 'x' }, fields, 'a', 'b')).toBeNull()
    expect(withReviewEdits(sent, { name: 5, details: {} }, fields, 'a', 'b')).toBeNull()
  })
})
