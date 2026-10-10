import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { conceptCategories, editDistance, initialisms, parseAsk, termMatches, termsRequired, withoutSortWords, withoutTerms, wordMatches, words } from './ask'

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

  it('reads "open today" as open at any point left today, not only now', () => {
    // Asked at 7 AM, a mikvah that opens at 8 PM is open today; reading
    // this as "open now" said there was none.
    for (const input of ["is there a mikvah that's open today", 'mikvah open tonight', 'anything open later']) {
      const q = parseAsk(input)
      expect(q.openToday, input).toBe(true)
      expect(q.openNow, input).toBe(false)
      expect(q.terms, input).not.toContain('open')
    }
    expect(parseAsk('is there a place open that sells cheese').openToday).toBe(false)
    expect(parseAsk('is there a place open that sells cheese').openNow).toBe(true)
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

  it('reads the day a minyan question is about, and none of it is a word to look for', () => {
    const when = (q: string) => parseAsk(q).minyan?.when
    expect(when('shacharis tomorrow')).toEqual([{ day: 'tomorrow', label: 'tomorrow', tefillos: null }])
    expect(when('friday night minyan')?.[0]).toMatchObject({ day: 'fri', label: 'Friday night' })
    expect(when('where can i daven sunday morning')).toEqual([{ day: 'sun', label: 'Sunday morning', tefillos: ['shacharis', 'shabbos_mussaf'] }])
    expect(when('shabbos morning minyan')?.[0]).toMatchObject({ day: 'sat', label: 'Shabbos morning' })
    expect(when('motzei shabbos maariv')?.[0]).toMatchObject({ day: 'sat', label: 'Motzei Shabbos' })
    expect(when('kabbalas shabbos')?.map((w) => w.label)).toEqual(['Friday night', 'Shabbos'])
    expect(parseAsk('kabbalas shabbos').minyan?.tefillos).toEqual(['kabbalas_shabbos'])
    expect(parseAsk('kabbalas shabbos').times).toBeNull()
    for (const q of ['shacharis tomorrow', 'friday night minyan', 'shabbos morning minyan']) expect(parseAsk(q).terms, q).toEqual([])
    // Not a minyan question: the day stays the store's.
    expect(parseAsk('open friday').minyan).toBeNull()
    expect(parseAsk('maariv tonight').minyan?.when).toBeNull()
  })

  it('reads a day the calendar names, in any usual spelling, and its night', () => {
    const when = (q: string) => parseAsk(q).minyan?.when
    expect(when('mincha hoshana rabbah')).toEqual([{ day: { name: 'Hoshana Rabbah', festival: false, night: false }, label: 'Hoshana Rabbah', tefillos: null }])
    expect(when('Hoshana Raba shacharis')?.[0].label).toBe('Hoshana Rabbah')
    expect(when('shemini atzeret davening')?.[0].label).toBe('Shemini Atzeres')
    expect(when("sh'mini atzeres minyan")?.[0].label).toBe('Shemini Atzeres')
    expect(when('maariv simchat torah night')).toEqual([
      { day: { name: 'Simchas Torah', festival: false, night: true }, label: 'Simchas Torah night', tefillos: ['mincha', 'mincha_maariv', 'maariv', 'kabbalas_shabbos'] },
    ])
    expect(when('shacharis sukkot')?.[0].day).toEqual({ name: 'Sukkos', festival: true, night: false })
    expect(when('mincha erev yom kippur')?.[0].label).toBe('Erev Yom Kippur')
    expect(when('mincha chol hamoed')?.[0].label).toBe('Chol HaMoed')
    // None of it is a word for a shul to have.
    for (const q of ['mincha hoshana rabbah', 'maariv simchat torah night', 'shacharis sukkot']) expect(parseAsk(q).terms, q).toEqual([])
    // Not a minyan question: still a sukkah, not a day.
    expect(parseAsk('sukkot').minyan).toBeNull()
  })

  it('reads a minyan question: which tefillah, and a time if one was said', () => {
    expect(parseAsk('is there a maariv minyan at 6:45').minyan).toEqual({
      tefillos: ['maariv', 'mincha_maariv'],
      at: { hour: 6, minute: 45, meridiem: null },
      when: null,
    })
    expect(parseAsk('mincha at 1:30pm').minyan?.at).toEqual({ hour: 1, minute: 30, meridiem: 'pm' })
    expect(parseAsk('upcoming minyanim').minyan).toEqual({ tefillos: null, at: null, when: null })
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

describe('parseAsk — the order, and words that say nothing (fixes table, Sep 28)', () => {
  it('"sort by distance" and "nearest first" are the order, not words to find', () => {
    for (const q of ['meat sort by distance', 'meat sorted by distance', 'meat by distance', 'meat nearest first', 'meat, closest first']) {
      const p = parseAsk(`${q} `)
      expect(p.terms, q).toEqual(['meat'])
      expect(p.nearMe, q).toBe(true)
    }
  })

  it('"only" means nothing on its own', () => {
    expect(parseAsk('open meat within 3 miles only keystone ').terms).toEqual(['meat', 'keystone'])
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

describe('wordMatches', () => {
  it('matches a written word the way the search does, spelling folded', () => {
    expect(wordMatches('Chalav', ['cholov'].map((w) => words(w)[0]))).toBe(true)
    expect(wordMatches('Cheeses', ['cheese'])).toBe(true)
    expect(wordMatches('Challah', ['cheese'])).toBe(false)
  })

  it('forgives a typo only when asked to', () => {
    expect(wordMatches('Cheese', ['chese'])).toBe(false)
    expect(wordMatches('Cheese', ['chese'], true)).toBe(true)
  })
})

describe('parseAsk — "than Giant"', () => {
  it('reads the place after "than" or "besides" as one to leave out, not to look for', () => {
    // One of the questions actually asked in the group.
    const q = parseAsk('a better place for kosher wine than Giant')
    expect(q.excluding).toEqual(['giant'])
    expect(q.terms).toEqual(['wine'])
    expect(parseAsk("challah besides trader joe's").excluding).toEqual(['trader', 'joe'])
  })

  it('stops the name at a filler or kind-of-place word', () => {
    const q = parseAsk('wine other than giant near me')
    expect(q.excluding).toEqual(['giant'])
    expect(q.nearMe).toBe(true)
    const inCity = parseAsk('challah other than giant in center city')
    expect(inCity.excluding).toEqual(['giant'])
    expect(inCity.terms).toEqual(['challah', 'center', 'city'])
  })

  it('leaves out nothing when nothing follows', () => {
    expect(parseAsk('more wine than').excluding).toEqual([])
  })

  it('does not search for "good" or a hechsher every listing has', () => {
    expect(parseAsk('a pizza place with a good hechsher').terms).toEqual(['pizza'])
  })
})

describe('parseAsk — a date', () => {
  it('reads "a date restaurant" as an outing, but "dates" as the fruit', () => {
    expect(parseAsk('date restaurant near cherry hill').terms).toEqual(['cherry', 'hill'])
    expect(parseAsk('food for a date').terms).toEqual([])
    expect(parseAsk('date night restaurant').terms).toEqual([])
    expect(parseAsk('medjool dates').terms).toEqual(['medjool', 'date'])
  })
})

// Reported: "Food open past 6 with bagels" searched for the words "past" and
// "6" (and "past" matched pastries), read "open" as open right now, and so
// showed bagel places open now under a sentence saying that wasn't it.
describe('parseAsk — "open after 6"', () => {
  it('reads the time the place has to be open around, not words to look for', () => {
    for (const input of ['Food open past 6 with bagels', 'Food open after 6pm with bagels', 'food open after 6:00 PM with bagels']) {
      const q = parseAsk(input)
      expect(q.openAt, input).toEqual({ how: 'after', minutes: 18 * 60 })
      expect(q.terms, input).toEqual(['bagel'])
      expect(q.openNow, input).toBe(false)
    }
  })

  it('reads until, at and before, and a bare hour the way it is meant', () => {
    expect(parseAsk('bagels open until 9').openAt).toEqual({ how: 'until', minutes: 21 * 60 })
    expect(parseAsk('pizza open till 11 tonight').openAt).toEqual({ how: 'until', minutes: 23 * 60 })
    expect(parseAsk('anything open till midnight').openAt).toEqual({ how: 'until', minutes: 24 * 60 })
    expect(parseAsk('bagels open at 8am').openAt).toEqual({ how: 'at', minutes: 8 * 60 })
    expect(parseAsk('coffee open at 7').openAt).toEqual({ how: 'at', minutes: 7 * 60 })
    expect(parseAsk('mikvah open at 9pm').openAt).toEqual({ how: 'at', minutes: 21 * 60 })
    expect(parseAsk('food open by 2').openAt).toEqual({ how: 'at', minutes: 14 * 60 })
    expect(parseAsk('coffee open before 7').openAt).toEqual({ how: 'before', minutes: 7 * 60 })
  })

  it('takes "what’s open" and "anything open" along with the time', () => {
    for (const input of ["what's open after 10", 'anything open past midnight']) {
      expect(parseAsk(input).terms, input).toEqual([])
    }
  })

  it('leaves a minyan time alone', () => {
    const q = parseAsk('mincha at 6')
    expect(q.openAt).toBeNull()
    expect(q.minyan?.at).toMatchObject({ hour: 6 })
  })
})

describe('parseAsk — "best"', () => {
  it('reads a ranking, and never searches for the word', () => {
    for (const input of ['best kosher pizza', 'top grocery store', 'recommended restaurant', 'highest rated bakery', 'a better place for wine than Giant']) {
      const q = parseAsk(input)
      expect(q.best, input).toBe(true)
      expect(q.terms.some((t) => /best|top|recommend|rated|highest|better/.test(t)), input).toBe(false)
    }
    expect(parseAsk('kosher pizza').best).toBe(false)
  })
})

describe('parseAsk — the order asked for, as the Sort menu has it (Oct 10)', () => {
  it('reads "sort by popularity", "most liked", "popular first" as Popularity, not words to find', () => {
    for (const input of ['pizza sort by popularity', 'pizza by popularity', 'pizza most liked', 'most upvoted pizza', 'popular pizza', 'pizza, popular first', 'pizza sorted by rating']) {
      const q = parseAsk(input)
      expect(q.best, input).toBe(true)
      expect(q.nearMe, input).toBe(false)
      expect(q.terms, input).toEqual(['pizza'])
    }
  })

  it('reads "closest pizza" as Distance, but not "closest to CHOP"', () => {
    for (const input of ['closest pizza', 'the nearest shul']) {
      const q = parseAsk(input)
      expect(q.nearMe, input).toBe(true)
      expect(q.terms, input).not.toContain('closest')
    }
    expect(parseAsk('food closest to CHOP').nearMe).toBe(false)
  })

  it('an order and nothing else is every place in that order, not a search for "best"', () => {
    for (const input of ['best', 'sort by popularity', 'most popular']) {
      const q = parseAsk(input)
      expect(q.best, input).toBe(true)
      expect(q.terms, input).toEqual([])
    }
  })

  it('takes one order’s words out of the box and leaves the rest', () => {
    expect(withoutSortWords('pizza near me', 'nearest')).toBe('pizza')
    expect(withoutSortWords('Closest pizza', 'nearest')).toBe('pizza')
    expect(withoutSortWords('meat sorted by distance', 'nearest')).toBe('meat')
    expect(withoutSortWords('best pizza', 'popular')).toBe('pizza')
    expect(withoutSortWords('top rated pizza', 'popular')).toBe('pizza')
    expect(withoutSortWords('pizza sort by popularity', 'popular')).toBe('pizza')
    expect(withoutSortWords('pizza most liked', 'popular')).toBe('pizza')
    // The other order's words stay.
    expect(withoutSortWords('best pizza near me', 'popular')).toBe('pizza near me')
  })
})

describe('parseAsk — the eruv', () => {
  it('reads a question about the eruv itself', () => {
    for (const input of ['is the eruv up', 'where is the eruv', 'eruv status this shabbos', 'is the eruv up tonight', 'eruv map', 'can I carry this Shabbos', 'can I carry?']) {
      const q = parseAsk(input)
      expect(q.eruv, input).toBe(true)
      expect(q.terms, input).toEqual([])
    }
  })

  it('leaves a search that only mentions it to the listings', () => {
    expect(parseAsk('hotel inside the eruv').eruv).toBe(false)
    expect(parseAsk('who carries challah').eruv).toBe(false)
    expect(parseAsk('shabbos').eruv).toBe(false)
  })
})

describe('parseAsk — Shabbos and the day’s times', () => {
  it('reads which time is asked for', () => {
    const cases: [string, string][] = [
      ['when is candle lighting', 'candles'], ['candle lighting this Friday', 'candles'], ['licht bentchen', 'candles'], ['when does Shabbos start', 'candles'],
      ['when does shabbos end', 'havdalah'], ['havdalah', 'havdalah'], ['when is Shabbat over', 'havdalah'], ['motzei shabbos', 'havdalah'],
      ['shabbos times', 'shabbos'], ['when is shabbos', 'shabbos'],
      ['when is shkia today', 'Sunset'], ['sunset', 'Sunset'], ['netz', 'Sunrise'], ['latest shema', 'Latest Shema'], ['tzeis', 'Nightfall'],
    ]
    for (const [input, times] of cases) {
      const q = parseAsk(input)
      expect(q.times, input).toBe(times)
      expect(q.terms, input).toEqual([])
    }
  })

  it('leaves searches for things to the listings', () => {
    for (const input of ['shabbos', 'shabbos candles', 'havdalah candles', 'havdalah set', 'shabbos food', 'mincha before shkia']) expect(parseAsk(input).times, input).toBeNull()
  })
})

describe('parseAsk — questions about the guide itself', () => {
  it('reads what’s asked', () => {
    const cases: [string, string][] = [
      ["what's on this site", 'contents'], ['what does this site have', 'contents'], ['what can I find here', 'contents'], ['what is this site', 'contents'],
      ['what can I ask', 'ask'], ['how does the search work', 'ask'],
      ['who runs this', 'about'], ['who made this site', 'about'], ['is this site reliable', 'about'],
      ['how do I add a listing', 'add'], ['how can I suggest an edit', 'add'], ['add my business', 'add'], ['how do I add a restaurant', 'add'],
    ]
    for (const [input, meta] of cases) expect(parseAsk(input).meta, input).toBe(meta)
  })

  it('leaves questions about things alone', () => {
    for (const input of ["what's in the kiddush", 'what can I find in center city', 'whats on the menu', "what's open now", 'who has challah']) {
      expect(parseAsk(input).meta, input).toBeNull()
    }
  })
})

describe('withoutTerms', () => {
  it('drops the words of a term as they were typed, and keeps the rest as typed', () => {
    expect(withoutTerms('IKC Dairy places', ['dairy'])).toBe('IKC places')
    expect(withoutTerms('dairy', ['dairy'])).toBe('')
    expect(withoutTerms('Chalav Yisroel milk', ['chalav', 'yisroel'])).toBe('milk')
  })
})
