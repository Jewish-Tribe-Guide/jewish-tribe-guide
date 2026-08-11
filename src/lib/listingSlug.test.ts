import { describe, expect, it } from 'vitest'
import { listingSlug, resolveListing } from './listingSlug'
import type { DirectoryResource } from '@/types'

function item(id: string, name: string): DirectoryResource {
  return { id, name, category: 'grocery', anchorId: 'community', distance: 0, address: '' }
}

describe('listingSlug', () => {
  it('slugifies the name and appends a short id suffix', () => {
    expect(listingSlug(item('a1b2c3d4-e5f6-0000-0000-000000000000', 'Goldi'))).toBe('goldi-a1b2c3')
  })

  it('strips punctuation and collapses whitespace', () => {
    expect(listingSlug(item('a1b2c3d4-e5f6-0000-0000-000000000000', "Sam's Kosher Market!"))).toBe(
      'sam-s-kosher-market-a1b2c3',
    )
  })

  it('gives two listings with the same name different slugs', () => {
    const a = item('a1b2c3d4-0000-0000-0000-000000000000', 'Goldi')
    const b = item('ffeeddcc-0000-0000-0000-000000000000', 'Goldi')
    expect(listingSlug(a)).not.toBe(listingSlug(b))
  })

  it('falls back to just the id suffix for a name with no letters or digits', () => {
    expect(listingSlug(item('a1b2c3d4-0000-0000-0000-000000000000', '★★★'))).toBe('a1b2c3')
  })
})

describe('resolveListing', () => {
  const items = [
    item('a1b2c3d4-0000-0000-0000-000000000000', 'Goldi'),
    item('ffeeddcc-0000-0000-0000-000000000000', 'Corner Bakery'),
  ]

  it('resolves by the friendly slug', () => {
    expect(resolveListing(items, 'goldi-a1b2c3')?.id).toBe('a1b2c3d4-0000-0000-0000-000000000000')
  })

  it('falls back to a bare id for a link built before the slug existed', () => {
    expect(resolveListing(items, 'ffeeddcc-0000-0000-0000-000000000000')?.id).toBe(
      'ffeeddcc-0000-0000-0000-000000000000',
    )
  })

  it('returns undefined for an unknown param', () => {
    expect(resolveListing(items, 'nope')).toBeUndefined()
  })
})
