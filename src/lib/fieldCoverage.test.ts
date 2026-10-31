import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { CategoryConfig } from './categories'
import { fitsCheckedBy, notWatchedLine, placeCoverage, rowCheck, type CoverageIn } from './fieldCoverage'

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
    expect(notWatchedLine(c)).toBe('Not watched: minyan times, email')
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

  it('a food place’s hechsher is its main thing, checked by the certifier’s list', () => {
    expect(placeCoverage({ id: 'a' }, food, NONE)).toMatchObject({ notWatched: ['hechsher'], mainMissing: true })
    const c = placeCoverage({ id: 'a' }, food, { ...NONE, kosher: [{ id: 'a', on: ['x'] }] })
    expect(c.sources).toEqual(['certifier'])
  })
})

describe('the Checked by menu', () => {
  const c = placeCoverage({ id: 'a' }, food, { ...NONE, kosher: [{ id: 'a', on: ['x'] }] })
  it('by what checks a place, what doesn’t, and what’s broken', () => {
    expect(fitsCheckedBy(c, undefined, 'any')).toBe(true)
    expect(fitsCheckedBy(c, undefined, 'certifier')).toBe(true)
    expect(fitsCheckedBy(c, undefined, 'google')).toBe(false)
    expect(fitsCheckedBy(c, undefined, 'not-watched')).toBe(false)
    expect(fitsCheckedBy(c, ['Link doesn’t open'], 'broken')).toBe(true)
    expect(fitsCheckedBy(undefined, undefined, 'not-watched')).toBe(false)
  })
  it('link check only means nothing else checks it', () => {
    const only = { fields: [], notWatched: [], mainMissing: false, nameBy: [], sources: ['links' as const] }
    expect(fitsCheckedBy(only, undefined, 'links-only')).toBe(true)
    expect(fitsCheckedBy({ ...only, sources: ['links', 'google'] }, undefined, 'links-only')).toBe(false)
  })
})

describe('what an Edit listing row says', () => {
  const both = placeCoverage(listing, shul, { ...NONE, times: [{ id: 'a', pages: [on], newsletters: [{ active: true }] }], google: google('a', { name: 'google', phone: 'google', website: 'google' }) })
  const minyans = (box: 'weekday' | 'this_week') => ({ kind: 'minyans' as const, box, fields: [] })
  it('usual times are the website’s and a week’s the newsletter’s', () => {
    expect(rowCheck(minyans('weekday'), both)).toEqual({ names: ['Their website'], nothing: [] })
    expect(rowCheck(minyans('this_week'), both)).toEqual({ names: ['Newsletter'], nothing: [] })
  })
  it('with one source, every box says that one', () => {
    const c = placeCoverage(listing, shul, { ...NONE, times: [{ id: 'a', pages: [on] }] })
    expect(rowCheck(minyans('this_week'), c)?.names).toEqual(['Their website'])
  })
  it('the contact row says who checks what, and what nothing does', () => {
    const c = placeCoverage({ id: 'a', phone: '215', email: 'a@x.org' }, shul, { ...NONE, google: google('a', { phone: 'google' }) })
    const row = { kind: 'contact' as const, fields: shul.detailFields.filter((f) => f.key === 'email') }
    expect(rowCheck(row, c)).toEqual({ names: ['Google'], nothing: ['email'] })
  })
  it('a row with nothing that goes out of date says nothing', () => {
    expect(rowCheck({ kind: 'fields', fields: shul.detailFields.filter((f) => f.key === 'about') }, both)).toBeNull()
  })
  it('the name row says Google only when Google keeps it', () => {
    expect(rowCheck({ kind: 'name', fields: [] }, both)).toEqual({ names: ['Google'], nothing: [] })
    expect(rowCheck({ kind: 'name', fields: [] }, placeCoverage(listing, shul, NONE))).toBeNull()
  })
})
