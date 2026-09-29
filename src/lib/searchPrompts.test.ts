import { describe, expect, it } from 'vitest'
import { answersWell, candidatePrompts, pickPrompts } from './searchPrompts'

const at = (h: number, m = 0) => h * 60 + m

describe('candidatePrompts — questions for the moment', () => {
  it('offers the davening that comes next, by the time of day', () => {
    expect(candidatePrompts({ day: 'mon', minutes: at(7) })[0]).toBe('Next Shacharis')
    expect(candidatePrompts({ day: 'mon', minutes: at(13) })[0]).toBe('Next Mincha')
    expect(candidatePrompts({ day: 'mon', minutes: at(19, 30) })[0]).toBe('Is there still a Maariv tonight?')
    expect(candidatePrompts({ day: 'mon', minutes: at(1) })[0]).toBe('Next minyan')
  })

  it('offers challah on a Friday before Shabbos, and not otherwise', () => {
    expect(candidatePrompts({ day: 'fri', minutes: at(10) })).toContain('Where can I get challah?')
    expect(candidatePrompts({ day: 'fri', minutes: at(16) })).not.toContain('Where can I get challah?')
    expect(candidatePrompts({ day: 'tue', minutes: at(10) })).not.toContain('Where can I get challah?')
  })

  it('offers food open now only while places might be', () => {
    expect(candidatePrompts({ day: 'mon', minutes: at(12) })).toContain('Food open now')
    expect(candidatePrompts({ day: 'mon', minutes: at(23, 30) })).not.toContain('Food open now')
  })

  it('offers only questions whose answer doesn’t depend on the time, before it’s known', () => {
    expect(candidatePrompts(null)).toEqual(['Where can I get chalav yisroel milk?', 'Kosher wine', 'Shul near me'])
  })
})

describe('answersWell', () => {
  it('keeps a real yes', () => {
    expect(answersWell({ text: 'Next Mincha: 2:00 PM, Mekor Habracha.' }, 3)).toBe(true)
  })

  it('drops a no, however true: a first try that says no teaches that search says no', () => {
    expect(answersWell({ text: 'Nothing open right now. 11 places match, but all are closed.' }, 0)).toBe(false)
    expect(answersWell({ text: 'No more Maariv today. First tomorrow: 7:15 PM, Mekor.' }, 3)).toBe(false)
  })

  it('drops a question with no answer, or nothing found', () => {
    expect(answersWell(null, 4)).toBe(false)
    expect(answersWell({ text: 'ShopRite has Wine.' }, 0)).toBe(false)
  })
})

describe('pickPrompts', () => {
  it('takes the first few that work, in order', () => {
    const works = (q: string) => q !== 'b'
    expect(pickPrompts(['a', 'b', 'c', 'd', 'e'], works)).toEqual(['a', 'c', 'd'])
    expect(pickPrompts(['a', 'b'], works, 3)).toEqual(['a'])
  })
})
