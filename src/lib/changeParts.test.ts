import { describe, expect, it } from 'vitest'
import { datesSaid, newListingFacts, shortParts, visitorChanges } from './changeParts'
import type { CategoryConfig, CategoryField } from './categories'
import type { DirectoryResource } from '@/types'

const open = (o: string, c: string) => ({ open: o, close: c })
const week = (d: { open: string; close: string } | null) => ({ sun: d, mon: d, tue: d, wed: d, thu: d, fri: d, sat: d })

const FIELDS: CategoryField[] = [
  { key: 'hours', label: 'Hours', type: 'hours' },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'photo', label: 'Photo', type: 'image' },
  { key: 'googleDescription', label: 'Description', type: 'textarea' },
  { key: 't', label: 'Food Type', type: 'select', options: [{ value: 'parve', label: 'Parve' }, { value: 'dairy', label: 'Dairy' }] },
  { key: 'partial', label: 'Everything here is kosher', type: 'boolean', invertDisplay: true },
  { key: 'kosherNote', label: 'What isn’t kosher?', type: 'textarea', showIf: { field: 'partial', equals: true } },
  { key: 'dishes', label: 'Main dishes', type: 'tags' },
  { key: 'minyanim', label: 'Davening Times (Minyanim)', type: 'minyanim' },
] as CategoryField[]

const listing = (details: Record<string, unknown> = {}): DirectoryResource =>
  ({ id: 'bj', category: 'restaurant', name: 'Ben & Jerry’s', anchorId: 'community', distance: 0, address: '218 S 40th St, Philadelphia, PA 19104, USA', phone: '(215) 382-5092', ...details }) as DirectoryResource
/** The edit: the same listing with `details` laid over it. */
function edit(before: Record<string, unknown>, after: Record<string, unknown>, core: Partial<{ name: string; address: string; phone: string }> = {}) {
  const was = listing(before)
  return visitorChanges(was, { name: was.name, address: was.address, phone: was.phone ?? '', ...core, details: { ...before, ...after } }, FIELDS)
}

describe('what an edit changed, said for visitors', () => {
  it('says only the new value, never the old (agreed Oct 2)', () => {
    const parts = edit({}, {}, { phone: '(215) 382-5000' })
    expect(parts).toEqual([{ key: 'phone', label: 'Phone', value: '(215) 382-5000' }])
    expect(JSON.stringify(parts)).not.toContain('5092')
  })

  it('hours: only the days that changed, as the site says times', () => {
    const parts = edit({ hours: week(open('11:00', '22:00')) }, { hours: { ...week(open('11:00', '22:00')), sun: open('12:00', '22:30'), mon: null } })
    expect(parts.map((p) => `${p.label} ${p.value}`)).toEqual(['Hours Sunday 12 PM – 10:30 PM', 'Hours Monday Closed'])
  })

  it('nothing for formatting: the same address typed another way, the same link with www', () => {
    expect(edit({ website: 'https://www.benjerry.com/upenn/' }, { website: 'benjerry.com/upenn' }, { address: '218 S 40th Street, Philadelphia, PA 19104' })).toEqual([])
  })

  it('a link as people say it; a choice by its label; a yes/no as the listing reads it', () => {
    const parts = edit({ t: ['parve'], partial: false, website: 'https://old.example.com' }, { t: ['dairy'], partial: true, website: 'https://www.benjerry.com/upenn/' })
    expect(parts.map((p) => [p.label, p.value])).toEqual([
      ['Website', 'benjerry.com/upenn'],
      ['Food Type', 'Dairy'],
      ['Everything here is kosher', 'No'],
    ])
  })

  it('text someone wrote, in full; Google’s description only named', () => {
    const note = 'Alcoholic beverages are NOT under supervision; list of approved alcoholic beverages available at restaurant upon request.'
    const parts = edit({ partial: true, kosherNote: 'All wine is supervised.', googleDescription: 'Iconic ice cream.' }, { kosherNote: note, googleDescription: 'Ice cream parlor chain.' })
    expect(parts).toEqual([
      { key: 'googleDescription', label: '', value: 'Description changed', quiet: true },
      { key: 'kosherNote', label: 'What isn’t kosher?', value: note },
    ])
  })

  it('leaves out a field the listing no longer shows (its show-if is off)', () => {
    expect(edit({ partial: true, kosherNote: 'Wine' }, { partial: true, kosherNote: 'Beer' }).map((p) => p.key)).toEqual(['kosherNote'])
    expect(edit({ partial: false, kosherNote: 'Wine' }, { kosherNote: 'Beer' })).toEqual([])
  })

  it('a photo: "New photo", said quietly', () => {
    expect(edit({ photo: 'a.jpg' }, { photo: 'b.jpg' })).toEqual([{ key: 'photo', label: '', value: 'New photo', quiet: true }])
  })

  it('a list: what went on and what came off', () => {
    expect(edit({ dishes: ['Steak', 'Falafel'] }, { dishes: ['Falafel', 'Shawarma'] })).toEqual([{ key: 'dishes', label: 'Main dishes', value: 'added Shawarma; taken off Steak' }])
  })

  // The user, Nov 23: one Sons of Israel edit was eleven lines.
  it('a shul’s usual times: the box that changed, by name, never minyan by minyan', () => {
    const shacharis = { id: 'm1', days: ['sat'], time: '10:30am', tefillah: 'shacharis' }
    const mincha = { id: 'm2', days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'], time: '1:30pm', tefillah: 'mincha' }
    const sunday = { id: 'm3', days: ['sun'], time: '8:00am', tefillah: 'shacharis' }
    const said = (before: object[], after: object[]) => edit({ minyanim: before }, { minyanim: after }).map((p) => p.value)
    expect(said([shacharis, sunday], [{ ...shacharis, time: '10:45am' }, { ...sunday, time: '7:30am' }])).toEqual(['Usual weekday times updated', 'Usual Shabbos times updated'])
    expect(said([shacharis, sunday], [shacharis])).toEqual(['Usual weekday times updated'])
    // Mincha Sunday to Friday: Friday's is Shabbos's.
    expect(said([shacharis, mincha], [shacharis, { ...mincha, notes: 'Friday only in summer' }])).toEqual(['Usual weekday times updated', 'Usual Shabbos times updated'])
    expect(said([shacharis], [{ ...shacharis, days: ['sat', 'yom_tov'] }])).toEqual(['Usual times updated'])
    expect(edit({ minyanim: [shacharis] }, { minyanim: [{ ...shacharis, time: '11:00am' }] })[0]).toEqual({ key: 'minyanim:shabbos', label: '', value: 'Usual Shabbos times updated', quiet: true })
  })

  it('a week: once, by its dates, posted or updated; weeks left as they were not said', () => {
    const wk = (id: string, from: string, to: string, time: string) => ({ id, name: 'Times for this week', kind: 'week', mode: 'replace', from, to, minyanim: [{ id: `${id}t`, tefillah: 'shacharis', on: [from], time }] })
    const old = wk('a', '2026-10-22', '2026-10-24', '7:00am')
    const before = { minyanim_schedules: [old, wk('b', '2026-11-15', '2026-11-20', '7:00am')] }
    const after = { minyanim_schedules: [old, wk('b', '2026-11-15', '2026-11-20', '7:15am'), wk('c', '2026-11-22', '2026-11-27', '7:00am'), wk('d', '2026-11-22', '2026-11-27', '9:00am'), wk('e', '2026-11-30', '2026-12-04', '7:00am')] }
    expect(edit(before, after).map((p) => p.value)).toEqual(['Times for Nov 15–20 updated', 'Times for Nov 22–27 posted', 'Times for Nov 30 – Dec 4 posted'])
  })

  it('nothing at all when nothing changed', () => {
    expect(edit({ hours: week(open('11:00', '22:00')) }, {})).toEqual([])
  })
})

describe('a new place’s facts', () => {
  it('as its opened listing says them: tagline, kind, badges', () => {
    const category = {
      id: 'restaurant',
      label: 'Food',
      detailFields: [
        { key: 's', label: 'Short Description', type: 'text', showInHeader: true, headerMaxLength: 40 },
        { key: 'foodType', label: 'Store Type', type: 'select', options: [{ value: 'Restaurant', label: 'Restaurant' }] },
        { key: 't', label: 'Food Type', type: 'select', renderAs: 'badge', filterable: true, options: [{ value: 'Parve', label: 'Parve' }] },
      ],
    } as unknown as CategoryConfig
    const facts = newListingFacts(listing({ s: 'Vegan Dine In', foodType: 'Restaurant', t: ['Parve'] }), category)
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ key: 'facts', quiet: true })
    expect(facts[0].value.split(' · ')).toEqual(expect.arrayContaining(['Vegan Dine In', 'Parve']))
  })
})

describe('said short, as Activity shows it', () => {
  it('a one-day date, and a field it doesn’t know named by its own label', () => {
    expect(datesSaid('2026-11-27', '2026-11-27')).toBe('Nov 27')
    expect(shortParts([{ key: 'x', label: 'Delivery', value: 'a'.repeat(81) }, { key: 'y', label: 'Phone', value: '215' }], [])).toEqual([
      { key: 'x', label: '', value: 'Delivery updated', quiet: true },
      { key: 'y', label: 'Phone', value: '215' },
    ])
  })
})
