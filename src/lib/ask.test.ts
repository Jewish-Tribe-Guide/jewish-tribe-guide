import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { conceptCategories, editDistance, initialisms, parseAsk, termMatches, termsRequired, words } from './ask'

describe('words', () => {
  it('folds spellings so a visitor and a listing meet whichever way each spelled it', () => {
    expect(words('Cholov Yisrael')).toEqual(words('Chalav Yisroel'))
    expect(words('Shabbat')).toEqual(words('shabbos'))
    expect(words('chala')).toEqual(words('Challah'))
    expect(words('mikveh')).toEqual(words('Mikvah'))
  })

  it('drops apostrophes and accents, and treats punctuation as a space', () => {
    expect(words("Trader Joe's")).toEqual(['trader', 'joe'])
    expect(words('Café—Bistro')).toEqual(['cafe', 'bistro'])
  })

  it('meets a plural with its singular, the same way on both sides', () => {
    expect(words('restaurants')).toEqual(words('restaurant'))
    expect(words('eggs')).toEqual(words('egg'))
    // …without chewing words that only look plural.
    expect(words('glass bus this')).toEqual(['glass', 'bus', 'this'])
  })

  it('expands the short forms people write', () => {
    expect(words('CY milk')).toEqual(['chalav', 'yisroel', 'milk'])
  })
})

describe('parseAsk', () => {
  // Phrasings from the two people who tried the prototype, and the questions
  // visitors, new residents and hospital families ask. Each has to come down
  // to what it's actually looking for.
  it.each([
    ['cholov yisroel milk', ['chalav', 'yisroel', 'milk'], []],
    ['where can I buy cholov yisroel milk', ['chalav', 'yisroel', 'milk'], []],
    ['Where can I get chalav yisrael milk?', ['chalav', 'yisroel', 'milk'], []],
    ['is there anywhere that sells pas yisroel bread', ['pas', 'yisroel', 'bread'], []],
    ['kosher wine', ['wine'], []],
    ['kosher food', [], ['food']],
    ['where can i eat', [], ['food']],
    ['kosher food near HUP', ['hup'], ['food']],
    ['food at HUP', ['hup'], ['food']],
    ['shul near me', [], ['synagogue']],
    ['where can I daven mincha', [], ['synagogue']],
    ['meat restaurant', ['meat'], ['food']],
    ['shabbos friendly hotel', ['shabbos', 'friendly'], ['hotel']],
  ])('%s', (input, terms, concepts) => {
    const q = parseAsk(input)
    expect(q.terms).toEqual(terms)
    expect(q.concepts.map((c) => c.concept)).toEqual(concepts)
  })

  it('reads "near me" as an instruction, not as words to find', () => {
    for (const input of ['shul near me', 'food close to me', 'mikvah nearby', 'grocery around here']) {
      const q = parseAsk(input)
      expect(q.nearMe, input).toBe(true)
      expect(q.terms, input).not.toContain('me')
    }
    expect(parseAsk('food at HUP').nearMe).toBe(false)
  })

  it('reads "open now" as an instruction', () => {
    for (const input of ['food open now', "what's open", 'pizza open late', 'restaurants open']) {
      const q = parseAsk(input)
      expect(q.openNow, input).toBe(true)
      expect(q.terms, input).not.toContain('open')
    }
    expect(parseAsk('challah').openNow).toBe(false)
  })

  it('gives the same answer every time it is asked', () => {
    // Both patterns are global regexes; `.test()` on one keeps its place
    // between calls, which would make every second "near me" come out false.
    for (let i = 0; i < 3; i++) {
      expect(parseAsk('shul near me').nearMe).toBe(true)
      expect(parseAsk('food open now').openNow).toBe(true)
    }
  })

  it('reads a distance limit, turning travel minutes into rough miles', () => {
    expect(parseAsk('shul within 1 mile').within).toEqual({ miles: 1, asked: null })
    expect(parseAsk('grocery within 2 mi').within).toEqual({ miles: 2, asked: null })
    expect(parseAsk('mikvah open tonight within a 15 minute drive of my location').within).toEqual({
      miles: 6,
      asked: { minutes: 15, by: 'drive' },
    })
    expect(parseAsk('kosher food 10 minute walk').within?.asked).toEqual({ minutes: 10, by: 'walk' })
    // The words that said it aren't left behind as things to search for.
    expect(parseAsk('mikvah within a 15 minute drive').terms).toEqual([])
  })

  it('reads a minyan question: which tefillah, and a time if one was said', () => {
    expect(parseAsk('is there a maariv minyan at 6:45').minyan).toEqual({
      tefillos: ['maariv', 'mincha_maariv'],
      at: { hour: 6, minute: 45, meridiem: null },
    })
    expect(parseAsk('mincha at 1:30pm').minyan?.at).toEqual({ hour: 1, minute: 30, meridiem: 'pm' })
    expect(parseAsk('upcoming minyanim').minyan).toEqual({ tefillos: null, at: null })
    expect(parseAsk('can you pull up a list of upcoming minyanim').terms).toEqual([])
    // A number in an address is not a time, and not a minyan question.
    expect(parseAsk('1500 walnut').minyan).toBeNull()
    expect(parseAsk('food at HUP').minyan).toBeNull()
  })

  it('never throws the question away: filler on its own is still searched for', () => {
    expect(parseAsk('kosher').terms).toEqual(['kosher'])
    expect(parseAsk('   ').terms).toEqual([])
  })
})

describe('conceptCategories', () => {
  const categories = [
    makeCategory({ id: 'restaurant', label: 'Food Establishment', pluralLabel: 'Food Establishments' }),
    makeCategory({ id: 'synagogue', label: 'Synagogue', pluralLabel: 'Synagogues' }),
    makeCategory({ id: 'grocery', label: 'Grocery Store', pluralLabel: 'Grocery Stores' }),
    makeCategory({ id: 'mikvah', label: 'Mikvah', pluralLabel: 'Mikvaot' }),
  ]

  it("finds the community's own category for a kind of place, whatever it's called", () => {
    expect(conceptCategories('food', categories)).toEqual(['restaurant'])
    expect(conceptCategories('synagogue', categories)).toEqual(['synagogue'])
    expect(conceptCategories('mikvah', categories)).toEqual(['mikvah'])
  })

  it('finds none when the community has no such category', () => {
    expect(conceptCategories('hotel', categories)).toEqual([])
  })
})

describe('termMatches', () => {
  it('matches the word, the start of it while typing, and one typo', () => {
    expect(termMatches('challah', ['challah'])).toBe(true)
    expect(termMatches('chal', ['challah'])).toBe(true)
    expect(termMatches('chalah', words('Challah'))).toBe(true)
    expect(termMatches('chllah', ['challah'])).toBe(true)
    expect(termMatches('chlalah', ['challah'])).toBe(true)
  })

  it('allows no typos in short words, where one letter is a different word', () => {
    expect(termMatches('pas', ['gas'])).toBe(false)
    expect(termMatches('milk', ['mild'])).toBe(false)
  })

  it('needs three letters before a word counts as the start of another', () => {
    expect(termMatches('ch', ['challah'])).toBe(false)
  })
})

describe('termsRequired', () => {
  it('needs every word of a short query and most of a long one', () => {
    expect([1, 2, 3, 4, 5].map(termsRequired)).toEqual([1, 2, 2, 3, 3])
  })
})

describe('editDistance', () => {
  it('counts a swap of two neighbouring letters as one edit', () => {
    expect(editDistance('chalav', 'chlaav', 2)).toBe(1)
    expect(editDistance('chalav', 'chalav', 2)).toBe(0)
    expect(editDistance('abc', 'xyz', 1)).toBe(2)
  })
})

describe('initialisms', () => {
  it('gives the short names people use for hospitals', () => {
    expect(initialisms('Hospital of the University of Pennsylvania')).toContain('hup')
    expect(initialisms("Children's Hospital of Philadelphia - Main Building")).toContain('chop')
  })

  it('has nothing for a one-word name', () => {
    expect(initialisms('Chalavita')).toEqual([])
  })
})
