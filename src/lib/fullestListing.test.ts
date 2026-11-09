import { describe, expect, it } from 'vitest'
import type { CategoryField } from './categories'
import type { DirectoryResource } from '@/types'
import { answered, fullestListing } from './fullestListing'

const fields: CategoryField[] = [
  { key: 'food_type', label: 'Food Type', type: 'select' },
  { key: 'dishes', label: 'Main dishes', type: 'tags' },
  { key: 'delivery', label: 'Delivery', type: 'boolean' },
]
const place = (id: string, extra: Record<string, unknown> = {}) => ({ id, category: 'food', name: id, anchorId: 'all', distance: 0, address: '', details: {}, ...extra }) as unknown as DirectoryResource

describe('fullestListing', () => {
  it('counts answers, not keys: empty text, an empty list and No are none', () => {
    expect(answered(place('a', { address: ' ', food_type: '', dishes: [], delivery: false }), { detailFields: fields })).toBe(0)
    expect(answered(place('b', { address: '1 Main St', phone: '215', food_type: 'Meat', dishes: ['Soup'], delivery: true }), { detailFields: fields })).toBe(5)
  })

  it('picks the place with the most answers, the first of a tie', () => {
    const items = [place('one', { food_type: 'Meat' }), place('two', { food_type: 'Dairy', dishes: ['Pizza'] }), place('three', { address: 'x', phone: 'y' })]
    expect(fullestListing(items, { detailFields: fields })?.id).toBe('two')
  })

  it('has none to pick from an empty page', () => {
    expect(fullestListing([], { detailFields: fields })).toBeNull()
  })
})
