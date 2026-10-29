import { describe, expect, it } from 'vitest'
import type { EnrichedSubmission } from '@/types'
import type { ClassifiedMiss } from './missedSearches'
import { makeCategory } from '@/test/providerFixtures'
import { changeWhat, isNewPlace, openSearches, responseSummary, splitSubmissions, submissionLine, teachable, todoCount, watchesLine, type TodoReading } from './todo'

function sub(overrides: Partial<EnrichedSubmission> = {}): EnrichedSubmission {
  return {
    id: 's',
    community_id: 'philly',
    operation: 'create',
    target_type: 'listing',
    target_id: null,
    payload: { category: 'food', name: 'Kosher Corner', address: '1 Main St', phone: '', details: {} },
    note: null,
    status: 'pending',
    submitted_by: { name: 'Jane' },
    created_at: '2026-10-24T15:00:00Z',
    reviewed_at: null,
    reviewed_by: null,
    ...overrides,
  } as EnrichedSubmission
}

const listing = { id: 'l1', community_id: 'philly', category: 'food', name: 'The Kosher Grill', anchor_id: 'community', distance: null, address: '1 Main St', phone: '555', details: {}, status: 'approved', submitted_by: null, created_at: '', reviewed_at: null }

function miss(term: string, overrides: Partial<ClassifiedMiss> = {}): ClassifiedMiss {
  return { term, count: 1, lastDay: '2026-10-26', dismissedAt: null, askedCategory: null, verdict: { kind: 'missing' }, ...overrides } as ClassifiedMiss
}

const reading = (question: string, words: string[] = [], hits = 1): TodoReading => ({
  key: question,
  question,
  proposals: words.map((word) => ({ word, categoryId: 'food', label: 'Food' })),
  hits,
  lastUsedAt: '2026-10-21T12:00:00Z',
})

// Board 1 groups what's waiting by what you decide, not by who sent it.
describe('splitSubmissions', () => {
  it('puts new listings under New places and everything else under Changes', () => {
    const create = sub({ id: 'new' })
    const edit = sub({ id: 'edit', operation: 'update', current: listing as never })
    const removal = sub({ id: 'del', operation: 'delete', current: listing as never })
    const category = sub({ id: 'cat', target_type: 'category', payload: { label: 'Bakeries' } })
    const eruv = sub({ id: 'eruv', target_type: 'eruv' })
    const { newPlaces, changes } = splitSubmissions([edit, create, removal, category, eruv])
    expect(newPlaces.map((s) => s.id)).toEqual(['new'])
    expect(changes.map((s) => s.id)).toEqual(['edit', 'del', 'cat', 'eruv'])
    expect(isNewPlace(category)).toBe(false)
  })
})

describe('the line under a suggestion', () => {
  const food = makeCategory({ id: 'food', detailFields: [{ key: 'hours', type: 'text', label: 'Hours' }] })

  it('says where a new place came from, and when', () => {
    expect(submissionLine(sub(), food)).toBe('a visitor · Oct 24')
    expect(submissionLine(sub({ submitted_by: { name: 'Mekor Habracha watch' } }), food)).toMatch(/· Oct 24$/)
  })

  it('names what a change is to', () => {
    const edit = sub({ operation: 'update', current: listing as never, payload: { ...listing, details: { hours: 'Game days' } } })
    expect(changeWhat(edit, food)).toBe('Hours')
    expect(submissionLine(edit, food)).toBe('Hours · a visitor · Oct 24')
    const many = sub({ operation: 'update', current: listing as never, payload: { ...listing, name: 'Grill', phone: '556', address: '2 Main St', details: { hours: 'x' } } })
    expect(changeWhat(many, food)).toMatch(/^\w+, \w+ and 2 more$/)
    expect(changeWhat(sub({ operation: 'delete', current: listing as never }), food)).toBe('Remove it')
    expect(changeWhat(sub({ target_type: 'category', payload: { label: 'Bakeries' } }), undefined)).toBe('New category')
  })
})

// The missed searches and the read questions were two lists (brief, "Where
// today's screens go"); now they're one.
describe('openSearches', () => {
  it('keeps what found nothing or only something close, and leaves out what is found now or dismissed', () => {
    const list = openSearches(
      [
        miss('giant'),
        miss('lev', { verdict: { kind: 'close', summary: '', places: [] } }),
        miss('bagels', { verdict: { kind: 'found', summary: '', places: [] } }),
        miss('old', { dismissedAt: '2026-10-01T00:00:00Z' }),
      ],
      [],
    )
    expect(list.map((s) => s.term)).toEqual(['giant', 'lev'])
  })

  it("brings a reading's words to its search, matched however it was typed", () => {
    const [s] = openSearches([miss('IKC Dairy?')], [reading('ikc dairy', ['ikc'])])
    expect(s.words.map((w) => w.word)).toEqual(['ikc'])
    expect(s.readingKey).toBeUndefined()
  })

  it('lists a reading with words to teach and no search of its own, and none with nothing to teach', () => {
    const list = openSearches([miss('giant', { count: 2 })], [reading('ikc', ['ikc'], 5), reading('nothing here'), reading('bagels', ['bagel'])])
    expect(list.map((s) => [s.term, s.count, s.readingKey])).toEqual([
      ['ikc', 5, 'ikc'],
      ['giant', 2, undefined],
      ['bagels', 1, 'bagels'],
    ])
    // A search that's answered or dismissed doesn't come back as a reading.
    expect(openSearches([miss('bagels', { verdict: { kind: 'found', summary: '', places: [] } })], [reading('bagels', ['bagel'])])).toEqual([])
  })
})

describe('teachable', () => {
  it('takes a search of up to three words', () => {
    expect(teachable("trader joe's")).toBe(true)
    expect(teachable('congregation bais me dress')).toBe(false)
    expect(teachable('  ')).toBe(false)
  })
})

describe('todoCount', () => {
  it('is suggestions and responses, never searches nobody found', () => {
    const waiting = { submissions: [1, 2], searches: [1], responses: [1, 2, 3] }
    expect(todoCount(waiting)).toBe(5)
  })
})

describe('responseSummary', () => {
  const base = { id: 'r', requestId: 'q', contact: {} as never, status: 'new' as const, createdAt: '2026-10-20T12:00:00Z', handledAt: null }
  it("names the form and gives the first words", () => {
    expect(responseSummary({ ...base, requestType: 'Feedback', formId: null, data: { rating: 5, message: '  The map is great  ' } }, new Map())).toEqual({
      id: 'r',
      title: 'Feedback',
      line: 'The map is great',
      createdAt: base.createdAt,
    })
    const long = 'x'.repeat(200)
    const r = responseSummary({ ...base, requestType: 'Custom', formId: 'meals', data: { note: long } }, new Map([['meals', 'Meal sign-up']]))
    expect(r.title).toBe('Meal sign-up')
    expect(r.line.length).toBe(80)
    expect(r.line.endsWith('…')).toBe(true)
  })
})

describe('watchesLine', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 29, h, m).toISOString()
  it('counts the pages read and says when the last run was', () => {
    expect(watchesLine([
      { active: true, lastRunAt: at(3, 58) },
      { active: true, lastRunAt: at(4) },
      { active: false, lastRunAt: at(9) },
    ])).toBe('2 pages read each night · last run 4:00 AM')
  })
  it('leaves the time off before anything has run', () => {
    expect(watchesLine([{ active: true, lastRunAt: null }])).toBe('1 page read each night')
  })
})
