import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { CategoryConfig } from './categories'
import { fitsCheckedBy, notCheckedLine, placeCoverage, type CoverageIn } from './fieldCoverage'

const NONE: CoverageIn = { google: [], times: [], hours: [], sites: [], dishes: [], hospitals: [], kosher: [], links: [], off: [] }
const on = { watch: { active: true } }
const google = (id: string, fields: Record<string, string>) => [{ id, fields: Object.entries(fields).map(([field, kind]) => ({ field, by: { kind } })) }] as never

const shul = makeCategory({
  id: 'synagogue',
  kind: 'listing',
  hasAddress: true,
  hasPhone: true,
  detailFields: [
    { key: 'minyanim', label: 'Minyanim', type: 'minyanim' },
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'about', label: 'About', type: 'textarea' },
  ],
} as Partial<CategoryConfig>)
const food = makeCategory({ id: 'restaurant', kind: 'listing', hasPhone: true, detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }, { key: 'kosherCert', label: 'Hechsher', type: 'select' }] } as Partial<CategoryConfig>)
const listing = { id: 'a', phone: '215', website: 'https://x.org', email: 'a@x.org', about: 'Warm.' }

describe('what checks each thing on a place', () => {
  it('a shul with no times page: its times aren’t watched, and come first', () => {
    const c = placeCoverage(listing, shul, { ...NONE, google: google('a', { phone: 'google', website: 'google' }) })
    expect(c.notWatched[0]).toBe('minyan times')
    expect(c.mainMissing).toBe(true)
    expect(notCheckedLine(c)).toBe('Not checked: minyan times, email')
  })

  it('a place shows up for what isn’t checked even when its main thing is', () => {
    const c = placeCoverage({ ...listing, phone: '' }, shul, { ...NONE, times: [{ id: 'a', pages: [on] }], google: google('a', { website: 'nothing' }) })
    expect(c.mainMissing).toBe(false)
    // The page read for times also gives its email.
    expect(c.notWatched).toEqual(['website'])
  })

  // Descriptions, notes and photos don't go out of date in a way a watch reads.
  it('never counts a description, and a blank phone or email isn’t missing', () => {
    const c = placeCoverage({ id: 'a' }, shul, { ...NONE, times: [{ id: 'a', pages: [on] }] })
    expect(c.fields.map((f) => f.key)).toEqual(['times'])
    expect(c.notWatched).toEqual([])
  })

  it('a field you keep yourself, as on a place marked Not on Google, is not watched', () => {
    const c = placeCoverage({ id: 'a', phone: '215' }, food, { ...NONE, google: google('a', { phone: 'you' }) })
    expect(c.notWatched).toContain('phone')
  })

  it('a job turned off checks nothing, and what it checked is not watched', () => {
    const input = { ...NONE, times: [{ id: 'a', pages: [on] }], google: google('a', { phone: 'google' }) }
    expect(placeCoverage({ id: 'a', phone: '215' }, shul, input).notWatched).toEqual([])
    expect(placeCoverage({ id: 'a', phone: '215' }, shul, { ...input, off: ['times'] }).notWatched).toContain('minyan times')
    expect(placeCoverage({ id: 'a', phone: '215' }, shul, { ...input, off: ['google', 'times', 'sites', 'hours'] }).notWatched).toContain('phone')
  })

  it('a stopped page reads nothing', () => {
    expect(placeCoverage({ id: 'a' }, shul, { ...NONE, times: [{ id: 'a', pages: [{ watch: { active: false } }] }] }).notWatched).toEqual(['minyan times'])
  })

  // The user, Nov 3: To do is what to act on, Places how things stand. Each
  // way out of a broken check lands here as Not checked, saying why.
  describe('a check stopped from To do is Not checked, with why', () => {
    const kosher = [{ id: 'a', on: ['x'] }]
    it('No menu online, though it has no menu link', () => {
      const c = placeCoverage({ id: 'a' }, food, { ...NONE, kosher, dishes: [{ id: 'a', menuUrl: null, reading: { status: 'no_menu' } }] })
      expect(notCheckedLine(c)).toBe('Not checked: menu (no menu online)')
    })
    it('Not on Google', () => {
      const c = placeCoverage({ id: 'a', phone: '215' }, food, { ...NONE, kosher, google: [{ id: 'a', notOnGoogle: '2026-11-01', fields: [{ field: 'phone', by: { kind: 'you' } }] }] as never })
      expect(notCheckedLine(c)).toBe('Not checked: phone (not on Google)')
    })
    it('Stop reading it: a stopped page, menu or Refuah page', () => {
      expect(notCheckedLine(placeCoverage({ id: 'a' }, shul, { ...NONE, times: [{ id: 'a', pages: [{ watch: { active: false } }] }] }))).toBe('Not checked: minyan times (stopped reading)')
      const menu = placeCoverage({ id: 'a' }, food, { ...NONE, kosher, dishes: [{ id: 'a', menuUrl: 'https://m.example', menuWatch: { active: false } }] })
      expect(notCheckedLine(menu)).toBe('Not checked: menu (stopped reading)')
      const hospital = makeCategory({ id: 'hospital', kind: 'listing', hasPhone: false, detailFields: [] } as Partial<CategoryConfig>)
      expect(notCheckedLine(placeCoverage({ id: 'a' }, hospital, { ...NONE, hospitals: [{ id: 'a', watch: { active: true }, notOnRefuah: true }] }))).toBe('Not checked: hospital contacts (not on Refuah)')
    })
    it('a job turned off says so; never set up says nothing more', () => {
      const input = { ...NONE, times: [{ id: 'a', pages: [on] }], off: ['times' as const] }
      expect(notCheckedLine(placeCoverage({ id: 'a' }, shul, input))).toBe('Not checked: minyan times (its job is off)')
      expect(notCheckedLine(placeCoverage({ id: 'a' }, shul, NONE))).toBe('Not checked: minyan times')
    })
  })

  it('a food place’s hechsher is its main thing, checked by the certifier’s list', () => {
    expect(placeCoverage({ id: 'a' }, food, NONE)).toMatchObject({ notWatched: ['hechsher'], mainMissing: true })
    const c = placeCoverage({ id: 'a' }, food, { ...NONE, kosher: [{ id: 'a', on: ['x'] }] })
    expect(c.sources).toEqual(['certifier'])
  })
})

describe('the Checked by menu', () => {
  const c = placeCoverage({ id: 'a' }, food, { ...NONE, kosher: [{ id: 'a', on: ['x'] }] })
  it('by what checks a place, and what doesn’t', () => {
    expect(fitsCheckedBy(c, 'any')).toBe(true)
    expect(fitsCheckedBy(c, 'certifier')).toBe(true)
    expect(fitsCheckedBy(c, 'google')).toBe(false)
    expect(fitsCheckedBy(c, 'not-watched')).toBe(false)
    expect(fitsCheckedBy(undefined, 'not-watched')).toBe(false)
  })
  it('link check only means nothing else checks it', () => {
    const only = { fields: [], notWatched: [], mainMissing: false, nameBy: [], sources: ['links' as const] }
    expect(fitsCheckedBy(only, 'links-only')).toBe(true)
    expect(fitsCheckedBy({ ...only, sources: ['links', 'google'] }, 'links-only')).toBe(false)
  })
})
