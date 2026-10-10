import { describe, expect, it } from 'vitest'
import { tellUsPlaceholder } from './tellUs'

// The box says what to do there, by what it was opened for, with the
// place's own name (Oct 10): no examples.
describe('tellUsPlaceholder', () => {
  it('says what to do, by what it was opened for', () => {
    expect(tellUsPlaceholder()).toBe('Write what you saw at a place, new or already here, or paste a post from the group.')
    expect(tellUsPlaceholder({ about: { name: 'Spruce Market' } })).toBe('Write what changed at Spruce Market, or paste a message about it.')
    expect(tellUsPlaceholder({ times: true, about: { name: 'Mekor Habracha' } })).toBe('Paste Mekor Habracha’s email or newsletter for this week.')
    expect(tellUsPlaceholder({ times: true })).toBe('Paste a shul’s email or newsletter for this week.')
    expect(tellUsPlaceholder({ menu: true, about: { name: 'Shtetl' } })).toBe('Paste their menu, or a link to it.')
  })

  it('gives no examples', () => {
    for (const p of [tellUsPlaceholder(), tellUsPlaceholder({ about: { name: 'X' } })]) expect(p).not.toMatch(/e\.g\.|“/)
  })
})
