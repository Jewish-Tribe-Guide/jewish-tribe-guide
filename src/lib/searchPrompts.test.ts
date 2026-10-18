import { describe, expect, it } from 'vitest'
import { answersWell, candidatePrompts, pickPrompts } from './searchPrompts'

const at = (h: number, m = 0) => h * 60 + m

describe('candidatePrompts — questions for the moment', () => {
  it('offers the davening that comes next, by the time of day', () => {
    expect(candidatePrompts({ day: 'mon', minutes: at(7) })[0]).toBe('Next Shacharis')
    expect(candidatePrompts({ day: 'mon', minutes: at(13) })[0]).toBe('Next Mincha')
    expect(candidatePrompts({ day: 'mon', minutes: at(19, 30) })[0]).toBe('Maariv tonight?')
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

  it('offers the eruv on Friday and Shabbos only', () => {
    expect(candidatePrompts({ day: 'fri', minutes: at(16) })).toContain('Is the eruv up?')
    expect(candidatePrompts({ day: 'sat', minutes: at(10) })).toContain('Is the eruv up?')
    expect(candidatePrompts({ day: 'wed', minutes: at(10) })).not.toContain('Is the eruv up?')
  })

  // A phone's row swipes and holds six (the user, Oct 17), so a weekday
  // afternoon has more than six to pick from, before some drop out for not
  // answering well.
  it('offers enough for a phone’s six on an ordinary afternoon', () => {
    expect(candidatePrompts({ day: 'tue', minutes: at(13) }).length).toBeGreaterThanOrEqual(8)
  })

  it('offers only questions whose answer doesn’t depend on the time, before it’s known', () => {
    expect(candidatePrompts(null)).toEqual(['Challah', 'Shabbos-friendly hotel', 'Young professionals', 'Ice cream', 'Kosher wine'])
  })

  // The user, Oct 18: everyday things, from across the guide, ahead of the
  // more particular ones.
  it('leads with everyday things from across the guide, after the next minyan', () => {
    expect(candidatePrompts({ day: 'tue', minutes: at(13) }).slice(0, 6)).toEqual([
      'Next Mincha',
      'Food open now',
      'Challah',
      'Shabbos-friendly hotel',
      'Young professionals',
      'Ice cream',
    ])
    expect(candidatePrompts({ day: 'tue', minutes: at(13) })).not.toContain('Chalav yisroel milk')
  })

  it('asks about challah once on a Friday morning', () => {
    const friday = candidatePrompts({ day: 'fri', minutes: at(10) })
    expect(friday).toContain('Where can I get challah?')
    expect(friday).not.toContain('Challah')
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

  it('drops a search that found nothing', () => {
    expect(answersWell(null, 0)).toBe(false)
    expect(answersWell({ text: 'ShopRite has Wine.' }, 0)).toBe(false)
  })

  // "Shabbos-friendly hotel" lands on Hotels with its 2 Shabbat-friendly
  // places, and writes no sentence to do it; those were dropped, so the
  // examples the user asked for (Oct 18: things people wouldn’t know they
  // could search) never showed.
  it('keeps a search that lands on its places without a sentence', () => {
    expect(answersWell(null, 2)).toBe(true)
  })
})

describe('pickPrompts', () => {
  it('takes the first few that work, in order', () => {
    const works = (q: string) => q !== 'b'
    expect(pickPrompts(['a', 'b', 'c', 'd', 'e'], works)).toEqual(['a', 'c', 'd'])
    expect(pickPrompts(['a', 'b'], works, 3)).toEqual(['a'])
  })
})
