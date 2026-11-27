import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from './categories'
import type { Proposal } from './messageReader'

const m = vi.hoisted(() => ({
  claim: vi.fn(),
  finish: vi.fn(),
  read: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  notify: vi.fn(),
  listings: vi.fn(),
  categories: vi.fn(),
  time: vi.fn(),
}))
vi.mock('./sentMessageStore', () => ({ claimRead: m.claim, finishRead: m.finish }))
vi.mock('./submissionStore', () => ({ submitListingCreate: m.create, submitListingUpdate: m.update }))
vi.mock('./email', () => ({ sendSubmissionNotification: m.notify }))
vi.mock('./resourceStore', () => ({ listApprovedResources: m.listings }))
vi.mock('./categoryStore', () => ({ listCategories: m.categories }))
vi.mock('./messageReadTime', () => ({ saveMessageReadTime: m.time }))
vi.mock('./serverError', () => ({ reportServerError: vi.fn() }))
vi.mock('./messageReader', async (orig) => ({ ...(await orig<typeof import('./messageReader')>()), readMessage: m.read }))

const { planFiling, readAndFile, BACKGROUND_EFFORT, MAX_ATTEMPTS } = await import('./messageFiling')

const ACME = '33333333-aaaa-4aaa-8aaa-000000000003'
const TJ = '22222222-aaaa-4aaa-8aaa-000000000002'
const grocery = { id: 'grocery', label: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] } as unknown as CategoryConfig
const food = { id: 'restaurant', label: 'Food', detailFields: [{ key: 'phone2', label: 'Other phone', type: 'text' }] } as unknown as CategoryConfig
const listing = (id: string, name: string, category: string, extra: Record<string, unknown> = {}) => ({ id, name, category, address: '1 Main St', anchorId: 'all', distance: 0, ...extra }) as DirectoryResource
const acme = listing(ACME, 'ACME Markets', 'grocery', { m: ['Chicken'] })
const tj = listing(TJ, 'Trader Joe’s', 'grocery', { m: [] })
const ctx = { byId: new Map([[ACME, acme], [TJ, tj]]), catById: new Map([['grocery', grocery], ['restaurant', food]]), canAdd: true, canEdit: true }
const q = { quote: 'x', checked: true }
const items = (listingId: string | null, extra: Partial<Extract<Proposal, { kind: 'items' }>> = {}): Proposal => ({
  kind: 'items',
  listingId,
  asWritten: 'Trader Joes',
  chain: false,
  ask: null,
  items: [{ name: 'Challah', availability: 'always', doubt: null }],
  note: null,
  ...q,
  ...extra,
})

describe('planFiling', () => {
  it('files a store’s new items as an edit to it, worked out from the listing', () => {
    const plan = planFiling([items(ACME)], ctx)
    expect(plan.left).toEqual([])
    expect(plan.filings).toHaveLength(1)
    expect(plan.filings[0]).toMatchObject({ op: 'update', listingId: ACME })
    expect(plan.filings[0].note).toContain('read by AI')
    expect(plan.filings[0].note).toContain('Challah')
  })

  it('never guesses which of several places a post means: that’s left for the admin', () => {
    const plan = planFiling([items(null, { ask: { question: 'Which one?', choices: [{ label: 'Arch St', listingId: ACME }, { label: 'Market St', listingId: TJ }] } })], ctx)
    expect(plan.filings).toEqual([])
    expect(plan.left).toEqual(['Which place? Arch St or Market St: “Trader Joes”'])
  })

  it('files nothing for items the store already has, and says nothing was read', () => {
    const plan = planFiling([items(ACME, { items: [{ name: 'Chicken', availability: 'always', doubt: null }] })], ctx)
    expect(plan.filings).toEqual([])
    expect(plan.left).toEqual(['Nothing to change was read from it.'])
  })

  it('files a new place in its category, saying what in the guide it may be', () => {
    const plan = planFiling(
      [{ kind: 'new_place', category: 'grocery', place: { name: 'Giant', kind: null, address: 'Columbus Blvd', phone: null, website: null, kosherCert: null, meatDairy: null, notes: null }, items: [], note: null, maybe: [ACME], ...q }],
      ctx,
    )
    expect(plan.filings[0]).toMatchObject({ op: 'create' })
    expect(plan.filings[0].submission.name).toBe('Giant')
    expect(plan.filings[0].note).toContain('It may already be in the guide as ACME Markets.')
  })

  it('leaves a new place when adding is off', () => {
    const plan = planFiling([{ kind: 'new_place', category: 'grocery', place: { name: 'Giant', kind: null, address: null, phone: null, website: null, kosherCert: null, meatDairy: null, notes: null }, items: [], note: null, maybe: [], ...q }], { ...ctx, canAdd: false })
    expect(plan.filings).toEqual([])
    expect(plan.left).toEqual(['A new place, not filed: “Giant”'])
  })

  it('hands a shul’s times to the week reader, and leaves a menu, a doubt and a non-update for the admin', () => {
    const plan = planFiling(
      [
        { kind: 'times', listingId: ACME, ...q },
        { kind: 'menu', listingId: ACME, asWritten: 'ACME', ask: null, url: 'https://acme.example/menu', ...q },
        { kind: 'ask_others', listingId: null, question: 'Is the bakery still under the Keystone-K?', ...q },
        { kind: 'not_update', note: 'A question about Shabbos' },
      ],
      ctx,
    )
    expect(plan.times).toEqual([ACME])
    expect(plan.left).toEqual([
      'A menu for ACME Markets: https://acme.example/menu. Read it from its Main dishes.',
      'Not sure: Is the bakery still under the Keystone-K?',
      'Not an update: A question about Shabbos',
    ])
  })
})

describe('readAndFile', () => {
  const community = { slug: 'philly', name: 'Philadelphia', timezone: 'America/New_York', ui: {} } as never
  const sent = { id: 'm1', community: 'philly', listingId: null as string | null, text: 'ACME has challah now', photoUrls: [], email: 'me@x.co', status: 'reading' as const, submissionIds: [], left: [], attempts: 0, createdAt: '', readAt: null }

  beforeEach(() => {
    vi.resetAllMocks()
    m.claim.mockResolvedValue(sent)
    m.listings.mockResolvedValue([acme, tj])
    m.categories.mockResolvedValue([grocery, food])
    m.update.mockResolvedValue({ id: 's1' })
    m.create.mockResolvedValue({ id: 's2' })
    m.notify.mockResolvedValue(undefined)
    m.finish.mockResolvedValue(undefined)
    m.read.mockResolvedValue({ proposals: [items(ACME)], model: 'm', effort: BACKGROUND_EFFORT, ms: 1, usage: { input: 1, cachedInput: 0, output: 1 } })
  })

  it('reads at the higher thinking level, files with the post and the sender’s email, and records it', async () => {
    expect(await readAndFile(community, sent, { apiKey: 'k' })).toBe('filed')
    expect(m.read.mock.calls[0][2]).toMatchObject({ effort: 'high' })
    expect(m.update).toHaveBeenCalledWith('philly', ACME, expect.objectContaining({ source: { readBy: 'ai', from: 'a message', original: 'ACME has challah now' } }), expect.any(String), { email: 'me@x.co' })
    expect(m.finish).toHaveBeenCalledWith('m1', ['s1'], [])
    expect(m.notify).toHaveBeenCalledTimes(1)
  })

  it('tells the reader which listing the box was opened from', async () => {
    m.claim.mockResolvedValue({ ...sent, listingId: ACME })
    await readAndFile(community, sent, { apiKey: 'k' })
    expect(m.read.mock.calls[0][2]).toMatchObject({ about: ACME })
  })

  it('reads nothing a second time once another read has taken it', async () => {
    m.claim.mockResolvedValue(null)
    expect(await readAndFile(community, sent, { apiKey: 'k' })).toBe('taken')
    expect(m.read).not.toHaveBeenCalled()
  })

  it('keeps a failed read for another try, then leaves it for the admin', async () => {
    m.read.mockRejectedValue(new Error('down'))
    expect(await readAndFile(community, sent, { apiKey: 'k' })).toBe('retry')
    expect(m.finish).not.toHaveBeenCalled()
    m.claim.mockResolvedValue({ ...sent, attempts: MAX_ATTEMPTS })
    expect(await readAndFile(community, { ...sent, attempts: MAX_ATTEMPTS - 1 }, { apiKey: 'k' })).toBe('left')
    expect(m.finish).toHaveBeenCalledWith('m1', [], ['The AI couldn’t read it.'])
  })

  it('says what it left, beside what it filed', async () => {
    m.read.mockResolvedValue({ proposals: [items(ACME), { kind: 'ask_others', listingId: null, question: 'Which bakery?', ...q }], model: 'm', effort: 'high', ms: 1, usage: null })
    expect(await readAndFile(community, sent, { apiKey: 'k' })).toBe('left')
    expect(m.finish).toHaveBeenCalledWith('m1', ['s1'], ['Not sure: Which bakery?'])
  })
})
