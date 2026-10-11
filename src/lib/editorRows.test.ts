import { describe, expect, it } from 'vitest'
import type { DirectoryResource } from '@/types'
import { FOOD, GROCERY, HOSPITAL, MIKVAH, SHUL } from '@/test/editorFixtures'
import { timeText } from './minyanText'
import type { Minyan } from './davening'
import { editorRows, opensInPlace, rowChanged, rowIsEmpty, rowSummary, type EditorValues } from './editorRows'

const titles = (rows: ReturnType<typeof editorRows>) => rows.map((r) => r.title)
const keys = (rows: ReturnType<typeof editorRows>, id: string) => rows.find((r) => r.id === id)!.fields.map((f) => f.key)
const values = (details: Record<string, unknown>, core: Partial<EditorValues> = {}): EditorValues => ({ name: 'A place', address: '', phone: '', details, ...core })

describe('the whole-listing editor’s rows', () => {
  it('Food: the listing’s order, the kosher facts together, the dishes as the main thing', () => {
    const rows = editorRows(FOOD, {})
    expect(titles(rows)).toEqual(['Name', 'Store Type', 'Kosher', 'Main dishes', 'Address, phone and website', 'Hours', 'About'])
    expect(keys(rows, 'name')).toEqual(['photo', 's'])
    // The certificate's link right under the hechsher, not with the website.
    expect(keys(rows, 'facts')).toEqual(['t', 'kosherCert', 'k', 'kosherPartial', 'kosherNote'])
    expect(keys(rows, 'contact')).toEqual(['website'])
    expect(keys(rows, 'about')).toEqual(['googleDescription', 'delivery_details'])
  })

  it('a certificate link stays with the website where there’s no hechsher to put it under', () => {
    const noHechsher = { ...FOOD, detailFields: FOOD.detailFields.filter((f) => !f.caveat) }
    expect(keys(editorRows(noHechsher, {}), 'contact')).toEqual(['website', 'k'])
  })

  it('a hidden field that isn’t a hechsher’s caveat isn’t offered: the listing never shows it', () => {
    const all = editorRows(FOOD, {}).flatMap((r) => r.fields.map((f) => f.key))
    expect(all).not.toContain('secret')
  })

  it('Grocery: the same rows, with its items where Food has dishes', () => {
    expect(titles(editorRows(GROCERY, {}))).toEqual(['Name', 'Kosher Store', 'Kosher items available', 'Address, phone and website', 'Hours'])
  })

  it('a mikvah: a row per section that’s on, its hours in it, and no hours row of its own', () => {
    const rows = editorRows(MIKVAH, { womenTevillah: true })
    expect(titles(rows)).toEqual(['Name', 'What’s here', 'Women’s', 'Address, phone, website and email'])
    expect(keys(rows, 'audience:womenTevillah')).toEqual(['women_s_hours', 'women_s_phone', 'women_s_notes'])
    expect(titles(editorRows(MIKVAH, { womenTevillah: true, menTevillah: true }))).toContain('Men’s')
  })

  // No Yom Tov and special schedules row (the user, Oct 11): a shul
  // doesn't have those ahead of time.
  it('a shul: its denomination, then its usual times as the listing’s two boxes, and no schedules row', () => {
    const rows = editorRows(SHUL, {})
    expect(titles(rows)).toEqual(['Name', 'Denomination', 'Usual weekday times', 'Usual Shabbos times', 'Address, phone and website'])
    expect(rows.filter((r) => r.kind === 'minyans').map((r) => r.box)).toEqual(['weekday', 'shabbos'])
  })

  it('a hospital: the admin’s boxes in order, Shabbos where the admin put it', () => {
    expect(titles(editorRows(HOSPITAL, {}))).toEqual(['Name', 'Who to call', 'Kosher food', 'Shabbos', 'Rides', 'Address, phone, website and links', 'Hours'])
    expect(keys(editorRows(HOSPITAL, {}), 'box:Kosher food')).toEqual(['pantry', 'food_packages'])
  })
})

describe('where a row opens', () => {
  const inPlace = (rows: ReturnType<typeof editorRows>) => rows.filter(opensInPlace).map((r) => r.id)
  // Hours alone open in place too (the user, Oct 11).
  it('Food: a few inputs, and the hours, open where they are; the dishes are a list, on their own screen', () => {
    expect(inPlace(editorRows(FOOD, {}))).toEqual(['name', 'kind', 'facts', 'contact', 'hours', 'about'])
  })
  it('a shul’s times, a mikvah’s sections (hours beside a note) and a hospital’s people are their own screens', () => {
    const shul = editorRows(SHUL, {})
    expect(shul.filter((r) => r.kind === 'minyans').some(opensInPlace)).toBe(false)
    const mikvah = editorRows(MIKVAH, Object.fromEntries(MIKVAH.detailFields.filter((f) => f.type === 'boolean').map((f) => [f.key, true])))
    expect(mikvah.filter((r) => r.kind === 'audience').length).toBeGreaterThan(0)
    expect(mikvah.filter((r) => r.kind === 'audience').some(opensInPlace)).toBe(false)
    const people = editorRows(HOSPITAL, {}).filter((r) => r.fields.some((f) => f.type === 'contacts'))
    expect(people.length).toBeGreaterThan(0)
    expect(people.some(opensInPlace)).toBe(false)
  })
})

describe('what a row says', () => {
  const facts = editorRows(FOOD, {}).find((r) => r.id === 'facts')!
  it('the facts in the listing’s words', () => {
    expect(rowSummary(facts, values({ t: ['Dairy'], kosherCert: 'IKC' }), timeText)).toBe('Dairy · IKC · Everything here is kosher')
  })
  it('a place where not everything is kosher says so, with what isn’t', () => {
    expect(rowSummary(facts, values({ kosherCert: 'IKC', kosherPartial: true, kosherNote: 'The meat counter' }), timeText)).toBe('IKC · Everything here is kosher: No · The meat counter')
  })
  it('the contact row: the street, the phone, the site by name', () => {
    const contact = editorRows(FOOD, {}).find((r) => r.id === 'contact')!
    expect(rowSummary(contact, values({ website: 'https://www.shopsweetbox.com/' }, { address: '339 S 13th St, Philadelphia, PA', phone: '(267) 975-1711' }), timeText)).toBe(
      '339 S 13th St · (267) 975-1711 · shopsweetbox.com',
    )
  })
  it('the certificate link by what it is, not a file’s address', () => {
    expect(rowSummary(facts, values({ kosherCert: 'IKC', k: 'https://x1.blob.vercel-storage.com/cert.pdf' }), timeText)).toBe('IKC · Certification · Everything here is kosher')
  })
  it('hours as a short line', () => {
    const hours = editorRows(FOOD, {}).find((r) => r.id === 'hours')!
    const week = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '09:00', close: '19:00' }]))
    expect(rowSummary(hours, values({ hours: week }), timeText)).toBe('Sun–Sat 9 AM–7 PM')
  })
  it('a shul’s box: its minyanim', () => {
    const shabbos = editorRows(SHUL, {}).find((r) => r.id === 'minyans:shabbos')!
    const minyanim: Minyan[] = [
      { id: 'a', tefillah: 'shacharis', days: ['sat'], time: '9:00am' },
      { id: 'b', tefillah: 'shacharis', days: ['mon'], time: '7:15am' },
    ]
    expect(rowSummary(shabbos, values({ minyanim }), timeText)).toBe('Shacharis 9 AM')
  })
  it('items: how many, and the first few', () => {
    const items = editorRows(GROCERY, {}).find((r) => r.id === 'items')!
    expect(rowSummary(items, values({ m: ['Challah', 'Wine'], m_sometimes: ['Steak'] }), timeText)).toBe('3 · Challah, Wine, Steak')
  })
})

describe('empty rows and changed rows', () => {
  const rows = editorRows(FOOD, {})
  const row = (id: string) => rows.find((r) => r.id === id)!
  const item = { id: '1', category: 'restaurant', name: 'Sweet Box', address: '339 S 13th St', phone: '(267) 975-1711', anchorId: 'all', distance: 0, kosherCert: 'IKC', hours: { mon: { open: '09:00', close: '19:00' } } } as unknown as DirectoryResource
  const same = (): EditorValues => ({ name: item.name, address: item.address!, phone: item.phone!, details: { kosherCert: 'IKC', hours: item.hours } })

  it('a row with nothing in it is empty; a yes/no that reads “Yes” when off doesn’t fill one', () => {
    expect(rowIsEmpty(row('about'), same())).toBe(true)
    expect(rowIsEmpty(row('facts'), same())).toBe(false)
    expect(rowIsEmpty(row('facts'), values({ kosherPartial: false }))).toBe(true)
    expect(rowIsEmpty(row('name'), values({}))).toBe(false)
  })

  it('nothing changed, nothing marked', () => {
    expect(rows.filter((r) => rowChanged(r, item, same()))).toEqual([])
  })

  it('a new address picked from Google marks every row it changed, not only the one opened', () => {
    const picked = { ...same(), name: 'Sweet Box Bakery', address: '400 Arch St', details: { ...same().details, hours: { mon: { open: '10:00', close: '19:00' } } } }
    expect(rows.filter((r) => rowChanged(r, item, picked)).map((r) => r.id)).toEqual(['name', 'contact', 'hours'])
  })

  it('a shul: a change in one box marks that box only', () => {
    const shul = editorRows(SHUL, {})
    const minyanim: Minyan[] = [
      { id: 'a', tefillah: 'shacharis', days: ['sat'], time: '9:00am' },
      { id: 'b', tefillah: 'shacharis', days: ['mon'], time: '7:15am' },
    ]
    const was = { ...item, category: 'synagogue', minyanim } as unknown as DirectoryResource
    const now: EditorValues = { name: was.name, address: was.address!, phone: was.phone!, details: { minyanim: [minyanim[0], { ...minyanim[1], time: '7:00am' }] } }
    expect(shul.filter((r) => rowChanged(r, was, now)).map((r) => r.id)).toEqual(['minyans:weekday'])
  })
})

// A Record on purpose: a new field type is a compile error here until it's
// given a sample, so it can't quietly go missing from the editor.
describe('every field type has a row', () => {
  const SAMPLE: Record<import('./categories').FieldType, true> = {
    image: true,
    contacts: true,
    url: true,
    hours: true,
    minyanim: true,
    tags: true,
    boolean: true,
    select: true,
    text: true,
    textarea: true,
    tel: true,
    number: true,
  }
  it('a field of each type, shown on the listing, is in some row', () => {
    const fields = (Object.keys(SAMPLE) as (keyof typeof SAMPLE)[]).map((type) => ({ key: type === 'image' ? 'photo' : `f_${type}`, label: type, type, ...(type === 'select' ? { options: [{ label: 'A', value: 'a' }] } : {}) }))
    const rows = editorRows({ ...FOOD, detailFields: fields }, {})
    const placed = rows.flatMap((r) => r.fields.map((f) => f.key))
    for (const f of fields) expect(placed, f.type).toContain(f.key)
  })
})
