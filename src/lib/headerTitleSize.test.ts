import { describe, expect, it } from 'vitest'
import { fitTitleSize, headerTitleSize } from './headerTitleSize'

describe('headerTitleSize', () => {
  it('guesses big for a short title and smaller for a long one', () => {
    expect(headerTitleSize('Food')).toBe(22)
    expect(headerTitleSize('Philly Jewish Guide')).toBe(17)
    expect(headerTitleSize('Hospitality & Lodging Near Hospitals')).toBe(15)
  })
})

describe('fitTitleSize', () => {
  it('takes the biggest size that fits, and the smallest when none does', () => {
    // A title 8px wide per point of size, in 140px.
    expect(fitTitleSize((px) => px * 8 <= 140)).toBe(17)
    expect(fitTitleSize(() => true)).toBe(22)
    expect(fitTitleSize(() => false)).toBe(15)
  })
})
