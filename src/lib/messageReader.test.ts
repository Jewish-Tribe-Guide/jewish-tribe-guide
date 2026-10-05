import { describe, expect, it, vi } from 'vitest'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from './categories'
import { buildCatalog, itemsChange, messageMessages, messageSource, newPlaceSubmission, readMessage, tidyMessageReading, type Catalog } from './messageReader'

const TJ_ARCH = '11111111-aaaa-4aaa-8aaa-000000000001'
const TJ_MARKET = '22222222-aaaa-4aaa-8aaa-000000000002'
const ACME = '33333333-aaaa-4aaa-8aaa-000000000003'
const MEKOR = '44444444-aaaa-4aaa-8aaa-000000000004'

const grocery = {
  id: 'grocery',
  label: 'Grocery',
  detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }],
} as unknown as CategoryConfig
const food = {
  id: 'restaurant',
  label: 'Food',
  detailFields: [
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'cert', label: 'Kosher certification', type: 'select', options: [{ value: 'Keystone-K', label: 'Keystone-K' }, { value: 'OU', label: 'OU' }] },
  ],
} as unknown as CategoryConfig
const shuls = { id: 'synagogue', label: 'Synagogue', detailFields: [{ key: 'minyanim', label: 'Davening times', type: 'minyanim' }] } as unknown as CategoryConfig

const listing = (id: string, name: string, category: string, address: string, extra: Record<string, unknown> = {}) =>
  ({ id, name, category, address, anchorId: 'all', distance: 0, ...extra }) as DirectoryResource
const listings = [
  listing(TJ_ARCH, 'Trader Joe’s', 'grocery', '1324 Arch St, Philadelphia, PA 19107, USA', { m: ['Chicken'], m_sometimes: [] }),
  listing(TJ_MARKET, 'Trader Joe’s', 'grocery', '2121 Market St, Philadelphia, PA 19103, USA', { m: ['Chicken'], m_sometimes: ['Steak'] }),
  listing(ACME, 'ACME Markets', 'grocery', '1001 South St, Philadelphia, PA', { m: ['Chicken', 'Challah'] }),
  listing(MEKOR, 'Mekor Habracha', 'synagogue', '1500 Walnut St, Philadelphia, PA'),
]
const catalog: Catalog = buildCatalog(listings, [grocery, food, shuls])
const text = (t: string) => ({ text: t, images: [] })

describe('buildCatalog and the prompt', () => {
  it('lists every listing with its items, and says which categories carry items or have times', () => {
    expect(catalog.itemNames).toEqual(['Challah', 'Chicken', 'Steak'])
    const system = (messageMessages(text('x'), catalog, { communityName: 'Philadelphia' })[0] as { content: string }).content
    expect(system).toContain('11111111 · Trader Joe’s · Grocery · 1324 Arch St, Philadelphia, PA 19107 · has: Chicken')
    expect(system).toContain('22222222 · Trader Joe’s · Grocery · 2121 Market St, Philadelphia, PA 19103 · has: Chicken · sometimes: Steak')
    expect(system).toContain('grocery (Grocery, lists items it carries)')
    expect(system).toContain('synagogue (Synagogue, has davening times)')
    expect(system).not.toContain('sent this from the listing')
  })

  it('tells the AI every field a message can change, by category, with each one’s choices', () => {
    const system = (messageMessages(text('x'), catalog, { communityName: 'Philadelphia' })[0] as { content: string }).content
    expect(system).toContain('restaurant: name "Name" (text); address "Address" (text); phone "Phone" (phone); website "Website" (link); cert "Kosher certification" (one of: Keystone-K | OU)')
    // Items and davening times have their own kinds.
    expect(system).toContain('grocery: name "Name" (text); address "Address" (text); phone "Phone" (phone)\n')
  })

  it('tells the AI which listing it was sent from, when it was', () => {
    const system = (messageMessages(text('x'), catalog, { communityName: 'Philadelphia', about: ACME })[0] as { content: string }).content
    expect(system).toContain('sent this from the listing "ACME Markets" (33333333)')
  })

  it('sends photos with the text', () => {
    const user = messageMessages({ text: '', images: [{ b64: 'AAA', mime: 'image/webp' }] }, catalog, { communityName: 'P' })[1] as { content: unknown[] }
    expect(user.content).toEqual([
      { type: 'text', text: 'Message: (no text, only the photo(s) below)' },
      { type: 'image_url', image_url: { url: 'data:image/webp;base64,AAA' } },
    ])
  })
})

describe('tidyMessageReading', () => {
  // Message #7 of the Oct 4 test, as GPT-6 Luna read it.
  const msg7 = '•⁠  ⁠acme on South & 10th- empire chicken sometimes\n•⁠  ⁠Trader Joe’s on Arch- always has empire chicken and kosher ground beef'

  it('maps short ids back to listings and checks each quote against the message', () => {
    const r = tidyMessageReading(
      {
        proposals: [
          { kind: 'items', store: { listing_id: '33333333', as_written: 'acme on South & 10th' }, items: [{ name: 'Chicken', availability: 'sometimes' }], quote: 'acme on South & 10th- empire chicken sometimes.' },
          { kind: 'items', store: { listing_id: '11111111' }, items: [{ name: 'ground beef', availability: 'always' }], quote: 'always has empire chicken and kosher steak' },
        ],
      },
      catalog,
      text(msg7),
    )
    expect(r.proposals).toMatchObject([
      { kind: 'items', listingId: ACME, checked: true, items: [{ name: 'Chicken', availability: 'sometimes', doubt: null }] },
      // A quote the message doesn't have is kept, but marked unchecked. And
      // an item goes in under the guide's own name for it (itemNames.ts).
      { kind: 'items', listingId: TJ_ARCH, checked: false, items: [{ name: 'Hamburger Meat', availability: 'always' }] },
    ])
  })

  // Oct 5 live run, message #6: "food and friends on 19 and spruce" came
  // back with Gelbstein's Bakery's id. A real id, so only the name says
  // it's the wrong one.
  it('goes by the listing’s name when the id it gave belongs to another listing', () => {
    const slip = (name: string) =>
      tidyMessageReading({ proposals: [{ kind: 'items', store: { listing_id: '44444444', listing_name: name }, items: [{ name: 'Wine', availability: 'always' }], quote: 'x' }] }, catalog, text('x')).proposals[0]
    expect(slip('ACME markets')).toMatchObject({ listingId: ACME })
    expect(slip('Mekor Habracha')).toMatchObject({ listingId: MEKOR })
    // Two listings by that name: it can't tell which, so it asks.
    expect(slip('Trader Joe’s')).toMatchObject({ listingId: null })
    expect(slip('Nobody')).toMatchObject({ listingId: null })
  })

  it('never points at a listing the guide doesn’t have', () => {
    const r = tidyMessageReading(
      { proposals: [{ kind: 'items', store: { listing_id: 'deadbeef' }, items: [{ name: 'Chicken', availability: 'seen' }], quote: 'x' }] },
      catalog,
      text('x'),
    )
    expect(r.proposals[0]).toMatchObject({ kind: 'items', listingId: null, ask: null })
  })

  it('keeps a “which one?” question with only real branches as choices', () => {
    const r = tidyMessageReading(
      {
        proposals: [
          {
            kind: 'items',
            store: { listing_id: null, as_written: 'trader joes', ask_sender: { question: 'Which Trader Joe’s?', choices: [{ label: 'Arch St', listing_id: '11111111' }, { label: 'Market St', listing_id: '22222222' }, { label: 'Made up', listing_id: 'ffffffff' }] } },
            items: [{ name: 'Ground turkey', availability: 'sometimes' }],
            quote: 'trader joes sometimes has ground turkey',
          },
        ],
      },
      catalog,
      text('trader joes sometimes has ground turkey and sometimes other types of beef'),
    )
    expect(r.proposals[0]).toMatchObject({ ask: { question: 'Which Trader Joe’s?', choices: [{ label: 'Arch St', listingId: TJ_ARCH }, { label: 'Market St', listingId: TJ_MARKET }] } })
  })

  it('takes times only for a shul in the guide', () => {
    const r = tidyMessageReading(
      { proposals: [{ kind: 'times', store: { listing_id: '44444444' }, quote: 'photo' }, { kind: 'times', store: { listing_id: '33333333' }, quote: 'x' }] },
      catalog,
      text(''),
    )
    expect(r.proposals).toEqual([{ kind: 'times', listingId: MEKOR, quote: 'photo', checked: false }])
  })

  // Oct 5: "change the kosher certification for say she ate to keystone k"
  // and "trader joe's on arch now closes at 3pm on wednesday" came back as
  // not updates.
  it('reads a change to a listing’s other fields, only fields its category has', () => {
    const r = tidyMessageReading(
      {
        proposals: [
          {
            kind: 'fields',
            store: { listing_id: '11111111', listing_name: 'Trader Joe’s' },
            changes: [
              { field: 'hours', days: ['wed'], open: null, close: '3:00', closed: false, when: 'unclear' },
              { field: 'phone', value: '215-555-0199', days: null },
              { field: 'cert', value: 'OU' },
              { field: 'm', value: 'Chicken' },
            ],
            quote: 'now closes at 3pm on wednesday',
          },
          { kind: 'fields', store: { listing_id: '11111111' }, changes: [{ field: 'nope', value: 'x' }], quote: 'x' },
        ],
      },
      catalog,
      text('trader joe’s on arch now closes at 3pm on wednesday'),
    )
    expect(r.proposals).toEqual([
      {
        kind: 'fields',
        listingId: TJ_ARCH,
        asWritten: '',
        ask: null,
        // Hours are the grocery's own field only when it has one: this one
        // doesn't, and a restaurant's hechsher isn't a grocery's.
        changes: [{ key: 'phone', value: '215-555-0199' }],
        note: null,
        quote: 'now closes at 3pm on wednesday',
        checked: true,
      },
    ])
  })

  it('keeps a week’s hours as which days, the times and whether it’s from now on', () => {
    const withHours = buildCatalog(listings, [{ ...grocery, detailFields: [...grocery.detailFields, { key: 'hours', label: 'Hours', type: 'hours' }] } as CategoryConfig, food, shuls])
    const r = tidyMessageReading(
      { proposals: [{ kind: 'fields', store: { listing_id: '11111111' }, changes: [{ field: 'hours', days: ['wed', 'someday'], open: null, close: '3:00', closed: false, when: 'sometime' }], quote: 'x' }] },
      withHours,
      text('x'),
    )
    expect(r.proposals[0]).toMatchObject({ changes: [{ key: 'hours', hours: { days: ['wed'], open: null, close: '03:00', closed: false, when: 'unclear' } }] })
  })

  it('keeps a new place’s category only when the guide has it', () => {
    const r = tidyMessageReading(
      { proposals: [{ kind: 'new_place', category: 'restaurant', place: { name: 'Kosher City Eats', address: '7598 Haverford Ave', kosher_cert: 'Keystone-K' }, quote: 'photo' }, { kind: 'new_place', category: 'spa', place: { name: 'X' }, quote: 'photo' }] },
      catalog,
      text(''),
    )
    expect(r.proposals).toMatchObject([
      { kind: 'new_place', category: 'restaurant', place: { name: 'Kosher City Eats', address: '7598 Haverford Ave', kosherCert: 'Keystone-K', phone: null } },
      { kind: 'new_place', category: null, place: { name: 'X' } },
    ])
  })

  // Oct 5 live run, message #18: "Spruce St Market on 16th and Spruce"
  // came back as a new place, though the guide has Spruce Market.
  it('points a new place at listings with a name like it, never at ones that only share “Market”', () => {
    const withSpruce = buildCatalog(
      [...listings, listing('55555555-aaaa-4aaa-8aaa-000000000005', 'Spruce Market', 'grocery', '1523 Spruce St'), listing('66666666-aaaa-4aaa-8aaa-000000000006', 'Rittenhouse Market', 'grocery', '1733 Spruce St')],
      [grocery, food, shuls],
    )
    const r = tidyMessageReading({ proposals: [{ kind: 'new_place', category: 'grocery', place: { name: 'Spruce St Market', address: '16th and Spruce' }, quote: 'x' }] }, withSpruce, text('x'))
    expect(r.proposals[0]).toMatchObject({ kind: 'new_place', maybe: ['55555555-aaaa-4aaa-8aaa-000000000005'] })
  })

  it('doesn’t hint at listings that only share a word half the guide has, or are in another category', () => {
    const ritas = Array.from({ length: 5 }, (_, i) => listing(`7777777${i}-aaaa-4aaa-8aaa-00000000000${i}`, 'Rita’s Italian Ice', 'restaurant', `${i} Main St`))
    const withRitas = buildCatalog([...listings, ...ritas], [grocery, food, shuls])
    const read = (name: string, category: string) =>
      tidyMessageReading({ proposals: [{ kind: 'new_place', category, place: { name }, quote: 'x' }] }, withRitas, text('x')).proposals[0]
    expect(read('Ice cream shop', 'restaurant')).toMatchObject({ maybe: [] })
    expect(read('Mekor Habracha Cafe', 'restaurant')).toMatchObject({ maybe: [] })
    expect(read('Mekor Habracha Annex', 'synagogue')).toMatchObject({ maybe: [MEKOR] })
  })

  it('says “not an update” when nothing usable came back', () => {
    expect(tidyMessageReading(null, catalog, text('hi')).proposals).toEqual([{ kind: 'not_update', note: null }])
    expect(tidyMessageReading({ proposals: [{ kind: 'items', items: [] }] }, catalog, text('hi')).proposals).toEqual([{ kind: 'not_update', note: null }])
  })

  it('drops items it can’t use, and the same item twice', () => {
    const r = tidyMessageReading(
      { proposals: [{ kind: 'items', store: { listing_id: '33333333' }, items: [{ name: 'challah', availability: 'seen' }, { name: 'Challos', availability: 'seen' }, { name: 'Wine', availability: 'plenty' }, { name: '', availability: 'seen' }], quote: 'x' }] },
      catalog,
      text('x'),
    )
    expect((r.proposals[0] as { items: unknown[] }).items).toEqual([{ name: 'Challah', availability: 'seen', doubt: null }])
  })
})

describe('itemsChange', () => {
  const tjMarket = listings[1]

  it('adds what they have, in always or sometimes, and says so a line each', () => {
    const c = itemsChange(grocery, tjMarket, [
      { name: 'Ground Beef', availability: 'always', doubt: null },
      { name: 'Ground Turkey', availability: 'sometimes', doubt: null },
      { name: 'Marshmallows', availability: 'seen', doubt: null },
    ])!
    expect(c.lines).toEqual(['+ Ground Beef', '+ Ground Turkey, sometimes', '+ Marshmallows'])
    expect(c.submission.details.m).toEqual(['Chicken', 'Ground Beef', 'Marshmallows'])
    expect(c.submission.details.m_sometimes).toEqual(['Steak', 'Ground Turkey'])
    expect(c.submission.name).toBe('Trader Joe’s')
  })

  it('takes off what they stopped carrying, and moves an item between always and sometimes', () => {
    const c = itemsChange(grocery, tjMarket, [
      { name: 'Chicken', availability: 'sometimes', doubt: null },
      { name: 'Steak', availability: 'always', doubt: null },
    ])!
    expect(c.lines).toEqual(['Chicken: now sometimes', 'Steak: now always'])
    const gone = itemsChange(grocery, listings[2], [{ name: 'Chicken', availability: 'stopped', doubt: null }])!
    expect(gone.lines).toEqual(['− Chicken'])
    expect(gone.submission.details.m).toEqual(['Challah'])
  })

  // "I think the Giant on Broad and Wash has cheese sticks": held, not added.
  it('holds what they weren’t sure of, a chain’s announcement, and what’s already there', () => {
    const c = itemsChange(grocery, tjMarket, [
      { name: 'Cheese Sticks', availability: 'always', doubt: 'I think' },
      { name: 'Yogurt', availability: 'announced', doubt: null },
      { name: 'Chicken', availability: 'seen', doubt: null },
      { name: 'Steak', availability: 'seen', doubt: null },
    ])!
    expect(c.lines).toEqual([])
    expect(c.held).toEqual([
      'Cheese Sticks: they weren’t sure (“I think”)',
      'Yogurt: announced for the chain, not seen here',
      'Chicken: already listed',
      'Steak: already listed as sometimes',
    ])
  })

  it('is null for a category that doesn’t list items', () => {
    expect(itemsChange(shuls, listings[3], [{ name: 'Chicken', availability: 'seen', doubt: null }])).toBeNull()
  })
})

describe('newPlaceSubmission', () => {
  it('fills name, address, phone, website and a hechsher the category offers; the rest goes in the note', () => {
    const { submission, note } = newPlaceSubmission(
      food,
      { name: 'Kosher City Eats & Catering', kind: 'food truck and catering', address: '7598 Haverford Ave', phone: '267 276 2582', website: 'www.koshercityeats.com', kosherCert: 'Keystone-K', meatDairy: null, notes: 'Open Monday to Thursday.' },
      [],
    )
    expect(submission).toMatchObject({
      category: 'restaurant',
      name: 'Kosher City Eats & Catering',
      address: '7598 Haverford Ave',
      phone: '267 276 2582',
      details: { website: 'https://www.koshercityeats.com', cert: 'Keystone-K' },
      geo: null,
    })
    expect(note).toBe('Kind of place: food truck and catering\nOpen Monday to Thursday.')
  })

  it('keeps a symbol the category has no choice for in the note, never in a field', () => {
    const { submission, note } = newPlaceSubmission(food, { name: 'Ice cream', kind: null, address: '145 S 13th St', phone: null, website: null, kosherCert: 'a plain K', meatDairy: 'dairy (inferred from ice cream)', notes: null }, [])
    expect(submission.details).toEqual({})
    expect(note).toBe('Kosher symbol: a plain K\nMeat or dairy: dairy (inferred from ice cream)')
  })

  it('lists a new store’s items, leaving out the doubtful and the stopped', () => {
    const { submission } = newPlaceSubmission(grocery, { name: 'Giant', kind: null, address: 'Columbus Blvd', phone: null, website: null, kosherCert: null, meatDairy: null, notes: null }, [
      { name: 'Chicken', availability: 'sometimes', doubt: null },
      { name: 'Wine', availability: 'always', doubt: null },
      { name: 'Brie', availability: 'always', doubt: 'I believe' },
    ])
    expect(submission.details).toEqual({ m: ['Wine'], m_sometimes: ['Chicken'] })
  })
})

describe('messageSource', () => {
  it('labels it read by AI, from a message or a photo, with the original', () => {
    expect(messageSource('Acme on 5th has challah', [])).toEqual({ readBy: 'ai', from: 'a message', original: 'Acme on 5th has challah' })
    expect(messageSource('', ['https://x/1.webp'])).toEqual({ readBy: 'ai', from: 'a photo', photoUrl: 'https://x/1.webp' })
  })
})

describe('readMessage', () => {
  it('tidies what the model returns, and says what it cost', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify({ proposals: [{ kind: 'items', store: { listing_id: '33333333' }, items: [{ name: 'challah', availability: 'seen' }], quote: 'Acme on 5th has challah' }] }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 50 } },
      }),
    ) as unknown as typeof fetch
    const r = await readMessage(text('Acme on 5th has challah'), catalog, { apiKey: 'k', communityName: 'P', fetchImpl })
    expect(r.proposals).toEqual([{ kind: 'items', listingId: ACME, asWritten: '', chain: false, ask: null, items: [{ name: 'Challah', availability: 'seen', doubt: null }], note: null, quote: 'Acme on 5th has challah', checked: true }])
    expect(r.usage).toEqual({ input: 100, cachedInput: 50, output: 20 })
  })

  it('throws on an error from the model, saying so', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { message: 'bad key' } }, { status: 401 })) as unknown as typeof fetch
    await expect(readMessage(text('x'), catalog, { apiKey: 'k', communityName: 'P', fetchImpl })).rejects.toThrow('Message reader: 401 bad key')
  })
})
