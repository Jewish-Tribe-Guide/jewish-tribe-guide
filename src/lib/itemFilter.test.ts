import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { itemFields } from './itemFilter'

describe('itemFields', () => {
  // The user, Nov 11: an admin can take a list of items out of "Has".
  it('is every list of items, unless an admin turned its filter off', () => {
    const category = makeCategory({
      detailFields: [
        { key: 'm', label: 'Kosher items available', type: 'tags', filterable: false },
        { key: 'd', label: 'Dishes', type: 'tags', itemFilter: false },
        { key: 'k', label: 'Kosher', type: 'boolean', filterable: true },
      ],
    })
    expect(itemFields(category).map((f) => f.key)).toEqual(['m'])
  })
})
