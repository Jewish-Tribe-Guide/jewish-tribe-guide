import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { kosherLookup } from './readNow'
import type { KeystoneEntry } from './keystoneWatch'
import type { MekorEntry } from './mekorWatch'

const food = makeCategory({ id: 'restaurant', detailFields: [{ key: 'kosherCert', label: 'Hechsher', type: 'multiselect' as never }] })
const draft = { name: 'Sabra Grill', address: '1 Main St', phone: '', details: {} }
const keystone = [{ name: 'Sabra Grill', slug: 'sabra-grill', url: 'https://keystone-k.org/sabra-grill', address: '1 Main St', levels: ['Meat'], certification: 'Keystone-K' }] as unknown as KeystoneEntry[]

describe('kosherLookup (KosherFound13, KosherNone13)', () => {
  it('neither list read: nothing to say', () => {
    expect(kosherLookup(food, draft, { keystone: null, mekor: null })).toBeNull()
  })

  it('on a list: names it, with what Use it fills in', () => {
    const got = kosherLookup(food, draft, { keystone, mekor: null })!
    expect(got.lists).toHaveLength(1)
    expect(got.lists[0].name).toBe('Keystone-K’s list')
    expect(got.lists[0].values.kosherCert).toEqual(['Keystone-K'])
    expect(got.lists[0].values.k).toBe('https://keystone-k.org/sabra-grill')
  })

  it('on neither: says which it looked at', () => {
    const got = kosherLookup(food, { ...draft, name: 'Somewhere Else' }, { keystone, mekor: [] as MekorEntry[] })!
    expect(got.lists).toEqual([])
    expect(got.none).toBe('Not on Keystone-K or Mekor Habracha’s list')
    expect(kosherLookup(food, { ...draft, name: 'Somewhere Else' }, { keystone, mekor: null })!.none).toBe('Not on Keystone-K’s list')
  })
})
