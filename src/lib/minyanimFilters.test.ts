import { describe, expect, it } from 'vitest'
import { WITHIN_CHOICES, milesChosen, typedTefillahChoices } from './minyanimFilters'

describe('typedTefillahChoices', () => {
  it('reads each tefillah typed as its chip, with the words to take out', () => {
    expect(typedTefillahChoices('Mincha near me')).toEqual(new Map([['Mincha', 'mincha']]))
    expect(typedTefillahChoices('shacharis maariv')).toEqual(new Map([['Shacharis', 'shacharis'], ['Maariv', 'maariv']]))
    expect(typedTefillahChoices('musaf')).toEqual(new Map([['Mussaf', 'musaf']]))
  })

  it('takes "kabbalas shabbos" as one, so "shabbos" isn’t left behind as a day', () => {
    expect([...typedTefillahChoices('kabbalas shabbos mekor').entries()]).toEqual([['Kabbalas Shabbos', 'kabbala shabbos']])
  })

  it('a day or a part of one isn’t a chip', () => {
    expect(typedTefillahChoices('shabbos morning')).toEqual(new Map())
    expect(typedTefillahChoices('mekor')).toEqual(new Map())
  })
})

// How far: walking distances, then a short drive (the user, Oct 20: kept as
// choices rather than a slider, with 5 miles added for driving).
describe('How far', () => {
  it('offers ½, 1, 3 and 5 miles, nearest first', () => {
    expect(WITHIN_CHOICES.map((c) => c.label)).toEqual(['Within ½ mi', 'Within 1 mi', 'Within 3 mi', 'Within 5 mi'])
    expect(milesChosen('Within 5 mi')).toBe(5)
    expect(milesChosen(null)).toBeNull()
  })
})
