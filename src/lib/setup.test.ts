import { describe, expect, it } from 'vitest'
import { ownHeroWords, setupLeft, setupSteps, type SetupState } from './setup'

const NEW: SetupState = { logo: false, admins: 1, categories: 0, places: 0, heroWords: false }

describe('setupSteps', () => {
  it('a new community has all four to do, in the drawn order, without the kosher lists', () => {
    expect(setupSteps(NEW, '/x/admin').map((s) => [s.name, s.done])).toEqual([
      ['Name and logo', false],
      ['A second admin', false],
      ['Your first category', false],
      ['The home page’s words', false],
    ])
    expect(setupLeft(NEW)).toBe(4)
  })

  it('ticks each off by what is saved', () => {
    const done = (s: Partial<SetupState>) => setupSteps({ ...NEW, ...s }, '').filter((x) => x.done).map((x) => x.key)
    expect(done({ logo: true })).toEqual(['name'])
    expect(done({ admins: 2 })).toEqual(['admins'])
    // A category alone isn't enough: its places make it a guide.
    expect(done({ categories: 1 })).toEqual([])
    expect(done({ categories: 1, places: 3 })).toEqual(['category'])
    expect(done({ heroWords: true })).toEqual(['words'])
  })

  it('nothing left once all four are done, and nothing counted when it could not be read', () => {
    expect(setupLeft({ logo: true, admins: 2, categories: 1, places: 1, heroWords: true })).toBe(0)
    expect(setupLeft(null)).toBe(0)
  })
})

describe('ownHeroWords', () => {
  const mission = 'A guide to Jewish Teaneck — community resources for residents and visitors.'

  it('the starting words, saved along with a logo, are not anyone’s own', () => {
    expect(ownHeroWords({ headline: 'A guide to Jewish Teaneck', subhead: 'community resources for residents and visitors.' }, mission)).toBe(false)
    expect(ownHeroWords(null, mission)).toBe(false)
    expect(ownHeroWords({ headline: '  ', subhead: 'Something' }, mission)).toBe(false)
  })

  it('either line changed makes them someone’s own', () => {
    expect(ownHeroWords({ headline: 'Jewish Teaneck, all in one place', subhead: 'community resources for residents and visitors.' }, mission)).toBe(true)
    expect(ownHeroWords({ headline: 'A guide to Jewish Teaneck', subhead: 'Kept current by the community' }, mission)).toBe(true)
  })
})
