import { describe, expect, it } from 'vitest'
import { tellUsPlaceholder } from './tellUs'

// The box says what to do there, by what it was opened for, with the
// place's own name (Oct 10): no examples. Then what the site does with it
// (Oct 16): it tries to read it, and the person checks what it read.
describe('tellUsPlaceholder', () => {
  it('says what to do, by what it was opened for, then that it will try to read it', () => {
    expect(tellUsPlaceholder()).toBe('Write what you saw at a place, new or already here, or paste a post from the group. We’ll try to read what changes, for you to check.')
    expect(tellUsPlaceholder({ about: { name: 'Spruce Market' } })).toBe('Write what changed at Spruce Market, or paste a message about it. We’ll try to read what changes, for you to check.')
    expect(tellUsPlaceholder({ times: true, about: { name: 'Mekor Habracha' } })).toBe('Paste Mekor Habracha’s email or newsletter for this week, or add a photo of it. We’ll try to read the times off it, for you to check.')
    expect(tellUsPlaceholder({ times: true })).toBe('Paste a shul’s email or newsletter for this week, or add a photo of it. We’ll try to read the times off it, for you to check.')
    expect(tellUsPlaceholder({ menu: true, about: { name: 'Shtetl' } })).toBe('Paste their menu or a link to it, or add photos of it. We’ll try to read the main dishes off it, for you to check.')
  })

  it('gives no examples, and never says AI', () => {
    for (const p of [tellUsPlaceholder(), tellUsPlaceholder({ about: { name: 'X' } }), tellUsPlaceholder({ times: true }), tellUsPlaceholder({ menu: true })]) {
      expect(p).not.toMatch(/e\.g\.|“/)
      expect(p).not.toMatch(/\bAI\b/)
    }
  })
})
