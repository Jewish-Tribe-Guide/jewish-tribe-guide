import { describe, expect, it, vi } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { questionKey, readerMessages, readerPlaces, readerVocabulary, readingFilters, tidyReading } from './questionReader'
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
