import { describe, expect, it, vi } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { questionKey, reachLabel, readerMessages, readerPlaces, readerVocabulary, readingFilters, readingItemsOn, readingReach, tidyReading } from './questionReader'
import { readQuestion } from './readQuestion'

const hours = { key: 'hours', label: 'Hours', type: 'hours' as const, filterable: true }
const food = makeCategory({
  id: 'restaurant',
  pluralLabel: 'Food',
  detailFields: [hours, { key: 't', label: 'Food Type', type: 'select', filterable: true }, { key: 'kosherCert', label: 'Kosher Cert', type: 'select', filterable: true }],
})
const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery', detailFields: [hours, { key: 'm', label: 'Kosher items', type: 'tags' }] })
const hotels = makeCategory({ id: 'hotel', pluralLabel: 'Hotels', detailFields: [{ key: 'shabbatFriendly', label: 'Shabbat friendly', type: 'boolean', filterable: true }] })
const listings = [
  makeListing({ id: 'judah', category: 'restaurant', t: ['Meat'], kosherCert: 'Keystone-K' }),
  makeListing({ id: 'sweet', category: 'restaurant', t: ['Dairy'], kosherCert: 'IKC' }),
  makeListing({ id: 'tj', category: 'grocery', m: ['Challah'], m_sometimes: ['Steak'] }),
]
const vocab = readerVocabulary([food, grocery, hotels], listings, ['Center City', 'HUP'])

describe('readerVocabulary — what the reader may choose from', () => {
  it('each category, whether it keeps hours, its filters with the values its places have, and the items', () => {
    expect(vocab.categories.find((c) => c.id === 'restaurant')).toEqual({
      id: 'restaurant',
      name: 'Food',
      openNow: true,
      filters: [
        { key: 't', label: 'Food Type', kind: 'pick', values: ['Dairy', 'Meat'] },
        { key: 'kosherCert', label: 'Kosher Cert', kind: 'pick', values: ['IKC', 'Keystone-K'] },
      ],
    })
    expect(vocab.categories.find((c) => c.id === 'hotel')?.openNow).toBe(false)
    expect(vocab.items).toEqual(['Challah', 'Steak'])
  })
})

describe('tidyReading — it can never hold what the site doesn’t have', () => {
  it('keeps a good reading, in the site’s own spelling', () => {
    expect(
      tidyReading({ categories: [{ id: 'restaurant', openNow: true, select: { t: ['meat'], kosherCert: ['keystone-k'] } }, { id: 'hotel', bool: ['shabbatFriendly'] }] }, vocab),
    ).toEqual({ categories: [{ id: 'restaurant', openNow: true, select: { t: ['Meat'], kosherCert: ['Keystone-K'] } }, { id: 'hotel', bool: ['shabbatFriendly'] }] })
  })

  it('drops a made-up category, filter, value, item or place', () => {
    expect(
      tidyReading(
        {
          categories: [{ id: 'bakeries' }, { id: 'restaurant', bool: ['glatt'], select: { t: ['Fleishig'], hechsher: ['OU'] } }],
          items: ['Gefilte Fish', 'challah'],
          near: 'Brooklyn',
        },
        vocab,
      ),
    ).toEqual({ categories: [{ id: 'restaurant' }], items: ['Challah'] })
  })

  it('an unsure filter is kept apart, only on a kind of place it read, and never a time', () => {
    expect(
      tidyReading(
        {
          categories: [{ id: 'restaurant', select: { t: ['Meat'] } }],
          maybe: [{ id: 'restaurant', openNow: true, select: { kosherCert: ['ikc'] } }, { id: 'hotel', bool: ['shabbatFriendly'] }, { id: 'restaurant', select: { t: ['Fleishig'] } }],
        },
        vocab,
      ),
    ).toEqual({ categories: [{ id: 'restaurant', select: { t: ['Meat'] } }], maybe: [{ id: 'restaurant', select: { kosherCert: ['IKC'] } }] })
  })

  it('a filter it’s unsure of is only offered, even when it also applied it', () => {
    // Oct 1: "meat restaurant" came back with Type: Restaurant in both.
    expect(
      tidyReading({ categories: [{ id: 'restaurant', select: { t: ['Meat'], kosherCert: ['IKC'] } }], maybe: [{ id: 'restaurant', select: { kosherCert: ['IKC'] } }] }, vocab),
    ).toEqual({ categories: [{ id: 'restaurant', select: { t: ['Meat'] } }], maybe: [{ id: 'restaurant', select: { kosherCert: ['IKC'] } }] })
    expect(tidyReading({ categories: [{ id: 'restaurant', select: { kosherCert: ['IKC'] } }], maybe: [{ id: 'restaurant', select: { kosherCert: ['IKC'] } }] }, vocab)).toEqual({
      categories: [{ id: 'restaurant' }],
      maybe: [{ id: 'restaurant', select: { kosherCert: ['IKC'] } }],
    })
  })

  it('"restaurant" is loose whatever the reader says: Type: Restaurant is only offered', () => {
    const typed = makeCategory({ id: 'restaurant', pluralLabel: 'Food', detailFields: [{ key: 't', label: 'Food Type', type: 'select', filterable: true }, { key: 'foodType', label: 'Type', type: 'select', filterable: true }] })
    const v = readerVocabulary([typed], [makeListing({ category: 'restaurant', t: ['Dairy'], foodType: ['Restaurant'] })], [])
    const read = { categories: [{ id: 'restaurant', select: { t: ['Dairy'], foodType: ['Restaurant'] } }] }
    expect(tidyReading(read, v, 'dairy restaurant')).toEqual({ categories: [{ id: 'restaurant', select: { t: ['Dairy'] } }], maybe: [{ id: 'restaurant', select: { foodType: ['Restaurant'] } }] })
    // Insisted on, it's a filter; and with no loose word, the reader's word stands.
    expect(tidyReading(read, v, 'a sit-down dairy restaurant').categories).toEqual(read.categories)
    expect(tidyReading(read, v, 'dairy places to sit and eat').categories).toEqual(read.categories)
  })

  it('no Open now for a category that keeps no hours', () => {
    expect(tidyReading({ categories: [{ id: 'hotel', openNow: true }] }, vocab)).toEqual({ categories: [{ id: 'hotel' }] })
  })

  it('"within 3 miles" or "nearest first" with nowhere named is from here', () => {
    expect(tidyReading({ categories: [{ id: 'restaurant' }], withinMiles: 3 }, vocab)).toMatchObject({ near: 'me', withinMiles: 3, sortByDistance: true })
    expect(tidyReading({ categories: [{ id: 'restaurant' }], sortByDistance: true }, vocab)).toMatchObject({ near: 'me', sortByDistance: true })
  })

  it('survives nonsense', () => {
    expect(tidyReading(null, vocab)).toEqual({ categories: [] })
    expect(tidyReading({ categories: 'food', withinMiles: -2 }, vocab)).toEqual({ categories: [] })
  })

  it('becomes the Map page’s own filters', () => {
    const reading = tidyReading({ categories: [{ id: 'restaurant', openNow: true, select: { t: ['Meat'] } }, { id: 'hotel' }] }, vocab)
    expect(readingFilters(reading)).toEqual({ categories: ['restaurant', 'hotel'], filters: { restaurant: { openNow: true, select: { t: ['Meat'] } } } })
  })
})

describe('readQuestion — the call', () => {
  it('sends the fixed part first and the question last, and tidies what comes back', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify({ categories: [{ id: 'restaurant', select: { t: ['Meat', 'Pork'] } }] }) } }],
        usage: { prompt_tokens: 1200, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 1024 } },
      }),
    )
    const r = await readQuestion('meat places', vocab, { apiKey: 'test', fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(r.reading).toEqual({ categories: [{ id: 'restaurant', select: { t: ['Meat'] } }] })
    expect(r.usage).toEqual({ input: 1200, cachedInput: 1024, output: 30 })
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.model).toBe('gpt-6-luna')
    expect(body.reasoning_effort).toBe('none')
    expect(body.messages).toEqual(readerMessages('meat places', vocab))
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'meat places' })
  })

  it('says what went wrong when the provider refuses', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { message: 'Incorrect API key' } }, { status: 401 }))
    await expect(readQuestion('meat', vocab, { apiKey: 'x', fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow('401 Incorrect API key')
  })
})

describe('questionKey — one question, however it’s typed', () => {
  it('ignores case, spacing, curly quotes and a question mark', () => {
    expect(questionKey('  Meat   near ME? ')).toBe('meat near me')
    expect(questionKey('Where’s the mikvah')).toBe(questionKey("where's the mikvah"))
  })
})

describe('readerPlaces — the places a question can name', () => {
  const hospitals = [
    makeListing({ id: 'h1', category: 'hospital', name: 'Hospital of the University of Pennsylvania', geo: { lat: 39.9496, lng: -75.1936 } }),
    makeListing({ id: 'h2', category: 'hospital', name: "Children's Hospital of Philadelphia - Main Building", geo: { lat: 39.948, lng: -75.194 } }),
  ]
  const places = readerPlaces(hospitals, 'philly')
  it('knows a hospital by its name and by the initials people use', () => {
    expect(places.get('hup')?.name).toBe('Hospital of the University of Pennsylvania')
    expect(places.get('chop')?.name).toBe("Children's Hospital of Philadelphia - Main Building")
  })
  it('knows the community’s neighbourhoods by their other names too', () => {
    expect(places.get('south philly')?.name).toBe('South Philadelphia')
    expect(places.get('center city')?.geo).toEqual({ lat: 39.9524, lng: -75.1636 })
  })
})

describe('answering from a reading — its items, and how far', () => {
  it('finds the items asked for on a listing, as its own tags, whether always or sometimes', () => {
    const tj = listings[2]
    expect(readingItemsOn(tj, ['challah', 'Steak'])).toEqual([
      { tag: 'Challah', sometimes: false },
      { tag: 'Steak', sometimes: true },
    ])
    expect(readingItemsOn(tj, ['Wine'])).toEqual([])
    expect(readingItemsOn(listings[0], [])).toEqual([])
  })

  const places = readerPlaces([makeListing({ id: 'h1', category: 'hospital', name: 'Hospital of the University of Pennsylvania', geo: { lat: 39.9496, lng: -75.1936 } })], 'philly')
  const me = { lat: 39.95, lng: -75.17 }
  const reach = (r: Partial<Parameters<typeof readingReach>[0]>, from: typeof me | null = me) => readingReach({ categories: [], ...r }, places, from)

  it('"within 3 miles" is from you, and says so', () => {
    expect(reach({ near: 'me', withinMiles: 3 })).toEqual({ from: me, label: 'you', miles: 3, inside: false, asked: true })
    expect(reachLabel(reach({ near: 'me', withinMiles: 3 })!)).toBe('Within 3 mi of you')
  })

  it('"near me" with no distance only puts the nearest first: nothing to remove', () => {
    expect(reachLabel(reach({ near: 'me' })!)).toBeNull()
    expect(reach({ near: 'me' }, null)).toBeNull()
  })

  it('a hospital named, with no distance, is where the nearest come first, by the initials people say', () => {
    // Not a limit: our own search shows every match, nearest to HUP first,
    // and the reading only ever adds to what it shows (decided Sep 30).
    expect(reach({ near: 'hup' })).toMatchObject({ label: 'HUP', miles: null, inside: false })
    expect(reachLabel(reach({ near: 'hup' })!)).toBe('Nearest to HUP')
    expect(reachLabel(reach({ near: 'hup', withinMiles: 2 })!)).toBe('Within 2 mi of HUP')
    expect(reachLabel(reach({ near: 'hospital of the university of pennsylvania' })!)).toBe('Nearest to HUP')
  })

  it('a neighbourhood named is the neighbourhood', () => {
    expect(reach({ near: 'center city' })).toMatchObject({ label: 'Center City', miles: 1.3, inside: true })
    expect(reachLabel(reach({ near: 'south philly' })!)).toBe('In South Philadelphia')
  })

  it('where the server said a place is, when the page doesn’t know it', () => {
    const place = { name: 'Hospital of the University of Pennsylvania', label: 'HUP', geo: { lat: 39.9496, lng: -75.1936 } }
    expect(reachLabel(readingReach({ categories: [], near: 'hup', place }, new Map(), me)!)).toBe('Nearest to HUP')
  })

  it('a place it doesn’t know reaches nowhere', () => {
    expect(reach({ near: 'brooklyn' })).toBeNull()
  })
})
