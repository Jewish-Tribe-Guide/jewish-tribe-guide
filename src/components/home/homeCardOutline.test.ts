import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HOME_CARD_OUTLINE, LIFT_ON_HOVER } from './AnswerCard'

// Board J1b (Nov 11): every white card on the computer home carries a quiet
// grey outline all the time; under the pointer it lifts and the outline
// turns blue. One constant, so the cards can't drift apart.
const dir = __dirname
const read = (f: string) => readFileSync(join(dir, f), 'utf8')

describe('computer home card outline', () => {
  it('is a visible grey ring, and hover turns it blue and lifts the card', () => {
    expect(HOME_CARD_OUTLINE).toMatch(/\bring-1\b/)
    expect(HOME_CARD_OUTLINE).toMatch(/ring-slate-300/)
    expect(LIFT_ON_HOVER).toMatch(/hover:ring-primary/)
    expect(LIFT_ON_HOVER).toMatch(/hover:-translate-y/)
  })

  it.each([
    ['AnswerCard.tsx'],
    ['MapCard.tsx'],
    ['TrustBand.tsx'],
    ['SuggestListingCard.tsx'],
    ['../Landing.tsx'],
  ])('%s uses the shared outline, not the old faint ring', (f) => {
    const src = read(f)
    expect(src).toContain('HOME_CARD_OUTLINE')
    expect(src).not.toContain('ring-slate-900/5')
  })
})

// Board K2 (Nov 11): the computer's footer is a white band, so the page
// ends; the phone keeps the page's grey (the user: "I'm ok with how it is
// for mobile").
describe('the footer', () => {
  it('is white on the computer only', () => {
    const src = read('../SiteFooter.tsx')
    const footer = src.match(/<footer className="([^"]+)"/)![1]!.split(/\s+/)
    expect(footer).toContain('desktop:bg-white')
    expect(footer).not.toContain('bg-white')
  })
})
