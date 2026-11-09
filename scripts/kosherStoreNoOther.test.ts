import { describe, expect, it } from 'vitest'
import { planFields } from './kosher-store-no-other.mjs'

// The user, Nov 8: Kosher Store's choices are set, and Other isn't one.
describe('kosher-store-no-other', () => {
  const store = { key: 'isKosher', label: 'Kosher Store', type: 'select', options: ['Kosher Store', 'Kosher Items', 'Other'].map((v) => ({ value: v, label: v })) }

  it('takes Other off Kosher Store and nothing else', () => {
    const other = { key: 'd', label: 'Denomination', type: 'select', options: [{ value: 'Other', label: 'Other' }] }
    const next = planFields([store, other])
    expect(next[0].options.map((o: { label: string }) => o.label)).toEqual(['Kosher Store', 'Kosher Items'])
    expect(next[1]).toBe(other)
  })

  it('changes nothing when it has no Other', () => {
    expect(planFields([{ ...store, options: store.options.slice(0, 2) }])).toBeNull()
  })
})
