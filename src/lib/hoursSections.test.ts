import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import { hoursDays, hoursRows, hoursSections, noteChanged, offeredSections, openClose, readSectionSource, rebaseSection, sectionChanges, sectionOfKeys, splitSections } from './hoursSections'

// The mikvah category as dev has it (Oct 22).
const mikvah = makeCategory({
  id: 'mikvah',
  detailFields: [
    { key: 'hours', label: 'Hours', type: 'hours' },
    { key: 'womenTevillah', label: 'Women’s Tevillah', type: 'boolean', filterLabel: 'Women’s' },
    { key: 'menTevillah', label: 'Men’s Tevillah', type: 'boolean', filterLabel: 'Men’s' },
    { key: 'keilim', label: 'Keilim', type: 'boolean' },
    { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours', audienceKey: 'womenTevillah' },
    { key: 'women_s_phone', label: 'Women’s Phone', type: 'tel', audienceKey: 'womenTevillah' },
    { key: 'women_s_notes', label: 'Women’s Notes', type: 'textarea', audienceKey: 'womenTevillah' },
    { key: 'men_s_hours', label: 'Men’s Hours', type: 'hours', audienceKey: 'menTevillah' },
    { key: 'men_s_notes', label: 'Men’s Notes', type: 'textarea', audienceKey: 'menTevillah' },
    { key: 'keilim_hours', label: 'Keilim Hours', type: 'hours', audienceKey: 'keilim' },
  ],
})
const KEYS = ['women_s_hours', 'men_s_hours', 'keilim_hours']
const SECTIONS = hoursSections(mikvah, KEYS)
const evening = (open: string, close: string) => ({ open, close })

describe('hoursSections', () => {
  it('is the listing’s own sections, as it heads them, each with its hours and notes', () => {
    expect(SECTIONS).toEqual([
      { section: 'womenTevillah', label: 'Women’s', hours: 'women_s_hours', notes: 'women_s_notes' },
      { section: 'menTevillah', label: 'Men’s', hours: 'men_s_hours', notes: 'men_s_notes' },
      { section: 'keilim', label: 'Keilim', hours: 'keilim_hours', notes: null },
    ])
  })

  it('is each hours field on its own in a category with no sections', () => {
    const plain = makeCategory({ detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }] })
    expect(hoursSections(plain, ['hours'])).toEqual([{ section: 'hours', label: 'Hours', hours: 'hours', notes: null }])
  })

  it('shows only the sections a place has: a mikvah with no men’s mikvah has no Men’s box', () => {
    expect(offeredSections(SECTIONS, { womenTevillah: true, keilim: true }).map((s) => s.label)).toEqual(['Women’s', 'Keilim'])
  })

  it('knows the one section a set of changes is in, and none when it spans two', () => {
    expect(sectionOfKeys(SECTIONS, ['women_s_hours', 'women_s_notes'])?.section).toBe('womenTevillah')
    expect(sectionOfKeys(SECTIONS, ['women_s_hours', 'men_s_hours'])).toBeNull()
    expect(sectionOfKeys(SECTIONS, ['women_s_hours', 'women_s_phone'])).toBeNull()
  })
})

describe('a reading, a section at a time', () => {
  const listing = {
    women_s_hours: { mon: evening('20:30', '22:30') },
    women_s_notes: 'By appointment.',
    men_s_hours: { sun: evening('04:30', '10:00') },
    keilim_hours: null,
  }

  it('splits into the sections it changes, each with only its own change', () => {
    const read = { ...listing, women_s_hours: { mon: evening('19:30', '21:30') }, men_s_hours: { sun: evening('05:00', '10:00') } }
    const got = splitSections(SECTIONS, listing, read)
    expect(got.map((g) => g.source)).toEqual([
      { section: 'womenTevillah', keys: ['women_s_hours', 'women_s_notes'] },
      { section: 'menTevillah', keys: ['men_s_hours', 'men_s_notes'] },
    ])
    expect(got[0].details).toMatchObject({ women_s_hours: { mon: evening('19:30', '21:30') }, men_s_hours: listing.men_s_hours })
    expect(got[1].details).toMatchObject({ women_s_hours: listing.women_s_hours, men_s_hours: { sun: evening('05:00', '10:00') } })
  })

  it('a note changed is a change; one spaced or quoted differently isn’t', () => {
    expect(splitSections(SECTIONS, listing, { ...listing, women_s_notes: '  By\nappointment. ' })).toEqual([])
    expect(splitSections(SECTIONS, { ...listing, women_s_notes: 'Call ‘Rivka’' }, { ...listing, women_s_notes: "Call 'Rivka'" })).toEqual([])
    expect(splitSections(SECTIONS, listing, { ...listing, women_s_notes: 'Appointments 48 hours ahead.' }).map((g) => g.source.section)).toEqual(['womenTevillah'])
  })

  it('is approved onto the listing as it is then: its own keys, nothing else undone', () => {
    const source = { section: 'womenTevillah', keys: ['women_s_hours', 'women_s_notes'] }
    const now = { ...listing, men_s_hours: { sun: evening('05:00', '10:00') }, women_s_phone: '215' }
    const sent = { ...listing, women_s_hours: { mon: evening('19:30', '21:30') } }
    expect(rebaseSection(source, now, sent)).toEqual({ ...now, women_s_hours: { mon: evening('19:30', '21:30') }, women_s_notes: 'By appointment.' })
    // A key it doesn't carry isn't emptied.
    expect(rebaseSection(source, now, { women_s_hours: null })).toEqual({ ...now, women_s_hours: null })
  })

  it('reads its source back, and nothing malformed', () => {
    expect(readSectionSource({ section: 'keilim', keys: ['keilim_hours'] })).toEqual({ section: 'keilim', keys: ['keilim_hours'] })
    expect(readSectionSource({ section: 'keilim', keys: [] })).toBeNull()
    expect(readSectionSource({ section: '', keys: ['x'] })).toBeNull()
    expect(readSectionSource('keilim')).toBeNull()
  })
})

describe('a section’s rows, as its box shows them', () => {
  it('runs days together as a person says them, Saturday as Shabbos', () => {
    expect(hoursDays(['mon', 'tue', 'wed', 'thu'])).toBe('Monday to Thursday')
    expect(hoursDays(['sun', 'mon', 'tue', 'wed', 'thu', 'sat'])).toBe('Sunday to Thursday, Shabbos')
    expect(hoursDays(['sun', 'tue'])).toBe('Sunday, Tuesday')
  })

  it('says a time once a side of noon, both across it', () => {
    expect(openClose(evening('19:30', '21:30'))).toBe('7:30–9:30 PM')
    expect(openClose(evening('11:00', '14:00'))).toBe('11:00 AM–2:00 PM')
  })

  // Lower Merion's women's hours as the drawing has them (Oct 20).
  it('marks a changed day beside what it was, days alike together; closed both ways isn’t a row', () => {
    const was = { sun: null, mon: evening('20:30', '22:30'), tue: evening('20:30', '22:30'), wed: evening('20:30', '22:30'), thu: evening('20:30', '22:30'), fri: null, sat: null }
    const now = { sun: evening('19:30', '21:30'), mon: evening('19:30', '21:30'), tue: evening('19:30', '21:30'), wed: evening('19:30', '21:30'), thu: evening('19:30', '21:30'), fri: null, sat: null }
    const rows = hoursRows(was, now)
    expect(rows).toEqual([
      { days: 'Sunday', text: '7:30–9:30 PM', was: 'Closed', mark: 'changed' },
      { days: 'Monday to Thursday', text: '7:30–9:30 PM', was: '8:30–10:30 PM', mark: 'changed' },
    ])
    expect(sectionChanges(rows, false)).toBe(2)
    expect(sectionChanges(rows, true)).toBe(3)
  })

  it('a section that’s the same is its hours, unmarked; none at all is None', () => {
    const men = { sun: evening('04:30', '10:00'), mon: evening('04:30', '10:00'), tue: evening('04:30', '10:00'), wed: evening('04:30', '10:00'), thu: evening('04:30', '10:00'), sat: evening('04:30', '10:00') }
    expect(hoursRows(men)).toEqual([{ days: 'Sunday to Thursday, Shabbos', text: '4:30–10:00 AM', mark: 'same' }])
    expect(hoursRows(null)).toEqual([{ days: 'None', text: '', mark: 'same' }])
    expect(hoursRows(null, { mon: evening('19:00', '21:00') })).toEqual([{ days: 'Monday', text: '7:00–9:00 PM', was: 'Not listed', mark: 'new' }])
  })

  it('a note reads as changed only when its words do', () => {
    expect(noteChanged('By  appointment.', 'By appointment.')).toBe(false)
    expect(noteChanged('', 'By appointment.')).toBe(true)
  })
})
