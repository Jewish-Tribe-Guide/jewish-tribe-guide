import { describe, expect, it } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { DirectoryResource } from '@/types'
import type { CategoryField } from './categories'
import { listingChanges } from './listingDiff'
import { answerSubmission, parseQuestionCard, pickListingQuestion, pickQuestion, questionCardFromKey, questionCardKey, questionCardOptions } from './questionCards'

const foodType = {
  key: 't',
  label: 'Food Type',
  type: 'select' as const,
  filterable: true,
  options: [
    { value: 'Meat', label: 'Meat' },
    { value: 'Dairy', label: 'Dairy' },
    { value: 'Parve', label: 'Parve' },
  ],
}
const food = makeCategory({
  id: 'restaurant',
  label: 'Food',
  questionCard: { kind: 'field', key: 't' },
  detailFields: [foodType, { key: 'notes', label: 'Notes', type: 'text' }],
})
const place = () => null
const names = (q: ReturnType<typeof pickQuestion>) => q?.item.name

describe('a field question', () => {
  const items = [
    { ...makeListing({ id: 'a', name: 'Grill' }), t: 'Meat' },
    makeListing({ id: 'b', name: 'Sweet Box Bakery' }),
    makeListing({ id: 'c', name: 'Truck' }),
  ] as DirectoryResource[]

  it('asks about the first place in the list’s order that doesn’t say, in plain words', () => {
    const q = pickQuestion(food, items, items, new Set(), place)
    expect(q?.kind).toBe('field')
    expect(q?.question).toBe('Sweet Box Bakery: meat, dairy or parve?')
    expect(q?.kind === 'field' && q.answers.map((a) => a.label)).toEqual(['Meat', 'Dairy', 'Parve'])
    expect(q?.footnote).toBe('2 places here don’t say yet. An admin checks each answer before it shows.')
  })

  it('names where the place is, as its row does', () => {
    expect(pickQuestion(food, items, items, new Set(), () => 'Rittenhouse')?.question).toBe('Sweet Box Bakery · Rittenhouse: meat, dairy or parve?')
  })

  it('moves on from a place this browser was already asked about', () => {
    expect(names(pickQuestion(food, items, items, new Set(['b']), place))).toBe('Truck')
    expect(pickQuestion(food, items, items, new Set(['b', 'c']), place)).toBeNull()
  })

  it('counts the whole category, not just the places the filters show', () => {
    expect(pickQuestion(food, [items[2]], items, new Set(), place)?.footnote).toMatch(/^2 places/)
  })

  it('asks a yes/no as its own label, and counts a saved "no" as saying', () => {
    const hotels = makeCategory({
      questionCard: { kind: 'field', key: 'sf' },
      detailFields: [{ key: 'sf', label: 'Shabbat friendly', type: 'boolean' }],
    })
    const rooms = [{ ...makeListing({ id: 'a', name: 'Loews' }), sf: false }, makeListing({ id: 'b', name: 'Cambria' })] as DirectoryResource[]
    const q = pickQuestion(hotels, rooms, rooms, new Set(), place)
    expect(q?.question).toBe('Cambria: Shabbat friendly?')
    expect(q?.kind === 'field' && q.answers).toEqual([
      { value: true, label: 'Yes' },
      { value: false, label: 'No' },
    ])
    expect(q?.footnote).toMatch(/^1 place here doesn’t say yet/)
  })

  it('asks "which …?" of a longer pick-list', () => {
    const shuls = makeCategory({
      questionCard: { kind: 'field', key: 'd' },
      detailFields: [
        {
          key: 'd',
          label: 'Denomination',
          type: 'select',
          options: ['Orthodox (Ashkenazi)', 'Conservative', 'Reform', 'Other'].map((v) => ({ value: v, label: v })),
        },
      ],
    })
    expect(pickQuestion(shuls, [makeListing({ name: 'Beth Am' })], [], new Set(), place)?.question).toBe('Beth Am: which denomination?')
  })

  it('never asks about a field the place’s own form wouldn’t show it', () => {
    const cat = makeCategory({
      questionCard: { kind: 'field', key: 't' },
      detailFields: [{ key: 'serves', label: 'Serves food', type: 'boolean' }, { ...foodType, showIf: { field: 'serves', equals: true } }],
    })
    const rows = [makeListing({ id: 'a', name: 'Shop' }), { ...makeListing({ id: 'b', name: 'Cafe' }), serves: true }] as DirectoryResource[]
    expect(names(pickQuestion(cat, rows, rows, new Set(), place))).toBe('Cafe')
  })

  it('asks nothing when the field is gone, or has too many choices for a tap', () => {
    expect(pickQuestion({ ...food, detailFields: [] }, items, items, new Set(), place)).toBeNull()
    const many = { ...foodType, options: 'abcdefg'.split('').map((v) => ({ value: v, label: v })) }
    expect(pickQuestion({ ...food, detailFields: [many] }, items, items, new Set(), place)).toBeNull()
  })
})

describe('been there lately?', () => {
  const grocery = makeCategory({
    id: 'grocery',
    label: 'Grocery',
    questionCard: { kind: 'confirm' },
    detailFields: [{ key: 'items', label: 'Items', type: 'tags', showCountInHeader: true }],
  })

  it('asks about the first place nobody has confirmed, naming what its row says it carries', () => {
    const rows = [
      { ...makeListing({ id: 'a', name: 'ACME' }), confirmedAt: '2026-09-01T00:00:00Z' },
      { ...makeListing({ id: 'b', name: 'GIANT' }), items: ['Wine', 'Challah', 'Deli', 'Cheese', 'Milk'] },
    ] as DirectoryResource[]
    const q = pickQuestion(grocery, rows, rows, new Set(), () => 'Center City')
    expect(q?.question).toBe('GIANT · Center City: still has wine, challah, deli +2?')
    expect(q?.footnote).toBe('No one has confirmed it yet.')
  })

  it('says when nobody has confirmed any place in the category', () => {
    const rows = [makeListing({ id: 'b', name: 'GIANT' })]
    expect(pickQuestion(grocery, rows, rows, new Set(), place)?.footnote).toBe('No one has confirmed a grocery listing yet.')
  })

  it('asks about a shul’s davening times', () => {
    const shuls = makeCategory({ questionCard: { kind: 'confirm' }, detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] })
    const rows = [{ ...makeListing({ name: 'Mekor Habracha' }), minyanim: [{ id: 'm', tefillah: 'mincha', days: ['mon'], time: '6:20pm' }] }] as DirectoryResource[]
    expect(pickQuestion(shuls, rows, rows, new Set(), place)?.question).toBe('Mekor Habracha: are its davening times still right?')
  })
})

describe('the answer', () => {
  const listing = {
    ...makeListing({ id: 'b', name: 'Sweet Box Bakery', address: '123 Pine St', phone: '215-555-0100' }),
    notes: 'Cash only',
    geo: { lat: 39.95, lng: -75.17 },
  } as DirectoryResource

  it('is an edit changing that one field and nothing else, so the queue shows just that', () => {
    const sub = answerSubmission(food, listing, foodType, 'Dairy')
    const changes = listingChanges(listing, sub, food.detailFields)
    expect(changes.map((c) => [c.key, c.after])).toEqual([['t', 'Dairy']])
    expect(sub).toMatchObject({ category: 'restaurant', name: 'Sweet Box Bakery', address: '123 Pine St', geo: { lat: 39.95, lng: -75.17 } })
  })

  it('stores a list for a pick-list that holds more than one value', () => {
    const multi = { ...foodType, multiSelect: true }
    expect(answerSubmission({ ...food, detailFields: [multi] }, listing, multi, 'Meat').details.t).toEqual(['Meat'])
  })
})

describe('what can be stored', () => {
  it('reads an unknown or broken question as none, never an error', () => {
    for (const raw of [null, undefined, 'confirm', {}, { kind: 'poll' }, { kind: 'field' }, { kind: 'field', key: '' }]) {
      expect(parseQuestionCard(raw)).toBeNull()
    }
  })

  it('round-trips each question through the editor’s select value', () => {
    for (const q of [{ kind: 'confirm' }, { kind: 'field', key: 't' }] as const) {
      expect(questionCardFromKey(questionCardKey(q))).toEqual(q)
    }
    expect(questionCardFromKey('')).toBeNull()
  })

  it('offers the admin only the questions the category’s fields make possible', () => {
    expect(questionCardOptions(food).map((o) => questionCardKey(o.value))).toEqual(['confirm', 'field:t'])
  })
})

describe('pickListingQuestion: an opened listing’s one question', () => {
  const t: CategoryField = { key: 't', label: 'Food Type', type: 'select', renderAs: 'badge', filterable: true, options: [{ value: 'Meat', label: 'Meat' }, { value: 'Dairy', label: 'Dairy' }, { value: 'Parve', label: 'Parve' }] }
  const foodType: CategoryField = { key: 'foodType', label: 'Store Type', type: 'select', renderAs: 'badge', filterable: true, options: [{ value: 'Restaurant', label: 'Restaurant' }, { value: 'Bakery', label: 'Bakery' }] }
  const shabbat: CategoryField = { key: 'shabbat', label: 'Shabbat friendly', type: 'boolean', renderAs: 'badge', filterable: true }
  const food = makeCategory({ detailFields: [foodType, t] })

  it('asks what decides it before what kind of place it is', () => {
    const q = pickListingQuestion(food, makeListing({ name: 'Sweet Box' }), new Set())
    expect(q?.kind === 'field' && q.field.key).toBe('t')
    expect(q?.question).toBe('Meat, dairy or parve?')
    expect(q?.kind === 'field' && q.answers.map((a) => a.label)).toEqual(['Meat', 'Dairy', 'Parve'])
  })

  it('then the kind, once the rest is said', () => {
    const q = pickListingQuestion(food, makeListing({ t: ['Parve'] }), new Set())
    expect(q?.question).toBe('Restaurant or bakery?')
  })

  it('the category’s own question card first', () => {
    const category = makeCategory({ detailFields: [foodType, t], questionCard: { kind: 'field', key: 'foodType' } })
    expect(pickListingQuestion(category, makeListing(), new Set())?.question).toBe('Restaurant or bakery?')
  })

  it('a yes/no as its own question; an unticked one has been answered', () => {
    const hotels = makeCategory({ detailFields: [shabbat] })
    expect(pickListingQuestion(hotels, makeListing(), new Set())?.question).toBe('Shabbat friendly?')
    expect(pickListingQuestion(hotels, makeListing({ shabbat: false }), new Set())).toBeNull()
  })

  it('nothing when it says everything, or this browser was asked already', () => {
    expect(pickListingQuestion(food, makeListing({ t: ['Meat'], foodType: 'Restaurant' }), new Set())).toBeNull()
    expect(pickListingQuestion(food, makeListing({ id: 'x' }), new Set(['x']))).toBeNull()
  })

  it('never a choice too long to tap through (a hechsher’s eleven)', () => {
    const cert: CategoryField = { key: 'cert', label: 'Hechsher', type: 'select', renderAs: 'badge', filterable: true, options: Array.from({ length: 11 }, (_, i) => ({ value: `c${i}`, label: `C${i}` })) }
    expect(pickListingQuestion(makeCategory({ detailFields: [cert] }), makeListing(), new Set())).toBeNull()
  })
})
