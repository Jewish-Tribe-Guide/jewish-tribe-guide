import { describe, expect, it } from 'vitest'
import { editorRows } from '@/lib/editorRows'
import { makeCategory } from '@/test/providerFixtures'
import { addRowSources, type AddState } from './addSources'

const shul = makeCategory({
  id: 'shul',
  label: 'Shul',
  detailFields: [
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'whatsapp', label: 'WhatsApp', type: 'url' },
    { key: 'email', label: 'Email', type: 'email' as never },
    { key: 'minyanim', label: 'Minyanim', type: 'minyanim' },
  ],
})

const state = (over: Partial<AddState> = {}): AddState => ({
  category: shul,
  picked: null,
  hasPlace: false,
  values: { name: 'Ohev', address: '', phone: '', details: {} },
  given: {},
  stopped: new Set(),
  reads: {},
  ...over,
})

function rowOf(s: AddState, id: string) {
  const row = editorRows(s.category, s.values.details, { splitContact: true }).find((r) => r.id === id)
  if (!row) throw new Error(`no row ${id}`)
  return addRowSources(s)(row)
}
const words = (s: AddState, id: string) => rowOf(s, id)?.lines.map((l) => [l.text, l.when, l.readNow && 'Read now', l.change && 'Change', l.add && (l.add.words ?? 'Add a source')].filter(Boolean).join(' · '))

describe('Add a place: what a row is read from', () => {
  const picked = { name: 'Ohev', phone: '(215) 555-0142', website: 'https://ohev.org' }
  const fromGoogle = state({ picked, values: { name: 'Ohev', address: '', phone: '(215) 555-0142', details: { website: 'https://ohev.org' } } })

  it('what Google filled in is Google’s, with Stop (AddRows11, AddGoogle8)', () => {
    expect(rowOf(fromGoogle, 'name')?.job).toBe('Google')
    expect(rowOf(fromGoogle, 'contact:phone')?.lines[0]).toMatchObject({ text: 'Google', googleStop: 'phone' })
    expect(rowOf(fromGoogle, 'field:website')?.job).toBe('Google')
  })

  it('typed over, Google stops keeping it (AddTyped8)', () => {
    const typed = { ...fromGoogle, values: { ...fromGoogle.values, phone: '1-800-555-0199' } }
    expect(words(typed, 'contact:phone')).toEqual(['Google stops keeping this'])
    expect(rowOf(typed, 'contact:phone')).toMatchObject({ job: 'Nothing', amber: true })
  })

  it('stopped, nothing reads it, and Google can have it back', () => {
    expect(rowOf({ ...fromGoogle, stopped: new Set(['phone'] as const) }, 'contact:phone')).toMatchObject({ job: 'Nothing', lines: [{ text: 'Nothing reads this', useGoogle: 'phone' }] })
  })

  it('filled in by hand, nothing reads it, and it can still be found on Google (AddSelf11, AddSelfPhone8)', () => {
    const s = state({ values: { name: 'Ohev', address: '', phone: '(215) 555-0142', details: {} } })
    expect(rowOf(s, 'name')).toMatchObject({ job: 'Nothing', amber: true })
    expect(rowOf(s, 'contact:phone')?.lines[0]).toMatchObject({ text: 'Nothing reads this', findOnGoogle: true })
  })

  it('a category Google doesn’t keep says nothing of its name', () => {
    const noGoogle = makeCategory({ id: 'x', label: 'X', hasAddress: false, hasPhone: false, detailFields: [] })
    expect(rowOf(state({ category: noGoogle }), 'name')).toBeNull()
  })

  it('a link is the Sunday link check’s (AddWhatsApp10)', () => {
    expect(words(state(), 'field:whatsapp')).toEqual(['Link check · Sunday'])
  })

  it('a shul with no website: nothing, and Add a source (AddNoSite8)', () => {
    expect(words(state(), 'minyans:weekday')).toEqual(['Nothing reads this · Add a source'])
    expect(rowOf(state(), 'minyans:weekday')?.amber).toBe(true)
  })

  it('a shul with a website: its website, Read now, Change, and Add a source under it (ReadNow13)', () => {
    expect(rowOf(fromGoogle, 'minyans:weekday')?.job).toBe('Website')
    expect(words(fromGoogle, 'minyans:weekday')).toEqual(['Its website · Read now · Change', 'Add a source'])
  })

  it('a page given is named, and an email goes first, one line each (GivenRead13, WebsiteEmail14)', () => {
    const both = { ...fromGoogle, given: { page: 'https://ohev.org/davening', email: 'office@ohev.org' } }
    expect(rowOf(both, 'minyans:weekday')?.job).toBe('Website, Email')
    expect(words(both, 'minyans:weekday')).toEqual(['office@ohev.org · Read now · Change', 'ohev.org/davening · Read now · Change'])
  })

  it('a read leaves its line saying how it went (Reading13, ReadDone13, ReadFailed13, ReadNothing13)', () => {
    const after = (read: AddState['reads']['page']) => words({ ...fromGoogle, reads: { page: read } }, 'minyans:weekday')
    expect(after({ state: 'reading' })?.[0]).toBe('Reading its website…')
    expect(after({ state: 'done' })?.[0]).toBe('Its website · just now · Change')
    expect(after({ state: 'none' })?.[0]).toBe('No minyan times on its website · Change')
    expect(after({ state: 'failed' })?.slice(0, 2)).toEqual(['Couldn’t read its website', 'Its website · Read now · Change'])
  })

  it('an email’s read says what the Gmail had (EmailFound14 to EmailNoGmail14)', () => {
    const after = (read: AddState['reads']['email']) => rowOf({ ...state({ given: { email: 'office@ohev.org' } }), reads: { email: read } }, 'minyans:weekday')?.lines[0]
    expect(after({ state: 'reading' })?.text).toBe('Looking in the guide’s Gmail…')
    expect(after({ state: 'found', on: 'Oct 30' })).toMatchObject({ text: 'office@ohev.org', when: 'Oct 30' })
    expect(after({ state: 'no-email' })).toMatchObject({ text: 'No emails from office@ohev.org yet', signUp: true })
    expect(after({ state: 'no-times', on: 'Oct 28' })?.text).toBe('office@ohev.org’s Oct 28 email had no times')
    expect(after({ state: 'no-answer' })).toMatchObject({ text: 'Couldn’t reach the guide’s Gmail', red: true })
    expect(after({ state: 'no-gmail' })).toMatchObject({ text: 'office@ohev.org', setUpGmail: true })
  })

  it('a food place’s dishes come from its menu, and only Food is on the kosher lists (FoodNoSite12, KosherFound13, KosherNone13)', () => {
    const food = makeCategory({ id: 'restaurant', label: 'Food', detailFields: [{ key: 'dishes', label: 'Main dishes', type: 'tags' }, { key: 'kosherCert', label: 'Kosher certification', type: 'select', caveat: true }] as never })
    const s = state({ category: food })
    const rows = editorRows(food, {}, { splitContact: true })
    const kosher = rows.find((r) => r.fields.some((f) => f.key === 'kosherCert'))!
    expect(addRowSources(s)(kosher)?.lines[0].text).toBe('Nothing reads this')
    const on = { name: 'Keystone-K’s list', url: 'https://k', values: { kosherCert: 'Keystone-K' } }
    expect(addRowSources({ ...s, kosher: { lists: [on], none: '' } })(kosher)?.lines[0]).toMatchObject({ text: 'On Keystone-K’s list', useList: on })
    expect(addRowSources({ ...s, kosher: { lists: [], none: 'Not on Keystone-K or Mekor Habracha’s list' } })(kosher)?.lines[0]).toMatchObject({ text: 'Not on Keystone-K or Mekor Habracha’s list', add: { words: 'Add its page' } })
    expect(addRowSources({ ...s, kosherUsed: 'Keystone-K’s list' })(kosher)).toMatchObject({ job: 'Keystone-K', lines: [{ text: 'Keystone-K’s list', when: 'today' }] })
  })

  it('a hospital’s contacts are Refuah’s, once it’s somewhere to look (HospitalRead13, HospitalNoMatch13)', () => {
    const hospital = makeCategory({ id: 'hospital', label: 'Hospital', detailFields: [{ key: 'liaisons', label: 'Liaisons', type: 'contacts' }] as never })
    const row = editorRows(hospital, {}, { splitContact: true }).find((r) => r.fields.some((f) => f.type === 'contacts'))!
    const s = state({ category: hospital, hasPlace: true })
    expect(addRowSources(s)(row)).toMatchObject({ job: 'Refuah', lines: [{ text: 'Refuah', readNow: 'refuah' }] })
    expect(addRowSources({ ...s, reads: { refuah: { state: 'not-found' } } })(row)?.lines[0]).toMatchObject({ text: 'Not found on Refuah', add: { words: 'Add its page' } })
    expect(addRowSources({ ...s, hasPlace: false })(row)?.lines[0].text).toBe('Nothing reads this')
  })
})
