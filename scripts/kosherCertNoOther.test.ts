import { describe, expect, it } from 'vitest'
import { planFields } from './kosher-cert-no-other.mjs'

// The user, Nov 9: Kosher Certification has a typed-in Other, so no
// "Other Kosher" choice as well.
describe('kosher-cert-no-other', () => {
  const opts = (...l: string[]) => l.map((v) => ({ value: v, label: v }))
  const cert = { key: 'kosherCert', label: 'Kosher Certification', type: 'select', allowOther: true, options: opts('OU', 'Tartikov', 'Other Kosher') }

  it('takes Other Kosher off Kosher Certification and nothing else', () => {
    const store = { key: 'isKosher', label: 'Kosher Store', type: 'select', options: opts('Kosher Store', 'Other') }
    const next = planFields([cert, store])
    expect(next[0].options.map((o: { label: string }) => o.label)).toEqual(['OU', 'Tartikov'])
    expect(next[1]).toBe(store)
  })

  it('leaves it where nothing can be typed in, and changes nothing without one', () => {
    expect(planFields([{ ...cert, allowOther: false }])).toBeNull()
    expect(planFields([{ ...cert, options: opts('OU') }])).toBeNull()
  })
})
