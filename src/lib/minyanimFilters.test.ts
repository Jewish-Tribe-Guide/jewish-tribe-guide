import { describe, expect, it } from 'vitest'
import { typedTefillahChoices } from './minyanimFilters'

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
