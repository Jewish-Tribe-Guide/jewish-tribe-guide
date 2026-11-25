import { describe, expect, it } from 'vitest'
import { jobPlaceRows, type JobHoursPlace } from './jobPlaceRows'

const shul = (over: Partial<JobHoursPlace>): JobHoursPlace => ({ id: 'x', name: 'X', off: false, reason: null, pages: [], ...over })
const page = (active = true) => ({ watch: { active } })
const email = { active: true, pageChangedAt: '2026-11-24T10:00:00Z' }

describe('a Watches row, opened: Nothing to read and Read', () => {
  it('shuls: what each is read from, and why nothing is', () => {
    const places = [
      shul({ id: 'a', name: 'Mekor', pages: [page()], newsletters: [email] }),
      shul({ id: 'b', name: 'Kol Tzedek', pages: [page()] }),
      shul({ id: 'c', name: 'BZBI', pages: [], newsletters: [email] }),
      shul({ id: 'd', name: 'Leyv Ha-Ir', reason: 'No website on Google.' }),
      shul({ id: 'e', name: 'Kesher', pages: [page()], reason: 'Its website wouldn’t open: 503' }),
      shul({ id: 'f', name: 'Quiet', pages: [], newsletters: [{ active: true, pageChangedAt: null }] }),
    ]
    const { missing, read } = jobPlaceRows('times', { tracked: [], places })
    expect(read.map((r) => [r.name, r.line])).toEqual([
      ['BZBI', 'Emails'],
      ['Kol Tzedek', 'Website'],
      ['Mekor', 'Website and emails'],
    ])
    expect(missing.map((r) => [r.name, r.line])).toEqual([
      ['Kesher', 'Its website wouldn’t open: 503'],
      ['Leyv Ha-Ir', 'No website'],
      ['Quiet', 'No website'],
    ])
    expect(read[0].page).toBe('place/c')
  })

  it('a place turned off, and one whose pages are all stopped, read nothing', () => {
    const { missing, read } = jobPlaceRows('hours', { tracked: [], places: [shul({ off: true, pages: [page()] }), shul({ id: 'y', name: 'Y', pages: [page(false)] })] })
    expect(read).toEqual([])
    expect(missing.map((r) => r.line)).toEqual(['Turned off for this place', 'No website'])
  })

  it('eruvs: every eruv, one with no source among Nothing to read', () => {
    const eruvim = [
      { id: 'lm', name: 'Lower Merion', statusUrl: 'https://lm.org', statusEmail: 'eruv@groups.io', statusErrorAt: null },
      { id: 'ne', name: 'Northeast', statusUrl: null, statusEmail: null, statusErrorAt: null },
      { id: 'cc', name: 'Center City', statusUrl: 'https://cc.org', statusEmail: null, statusErrorAt: '2026-11-24T00:00:00Z' },
    ]
    const { missing, read } = jobPlaceRows('eruvs', { tracked: [], eruvim })
    expect(read.map((r) => r.line)).toEqual(['Status page and emails'])
    expect(missing.map((r) => [r.name, r.line])).toEqual([
      ['Center City', 'Its status page didn’t load'],
      ['Northeast', 'No status page or email'],
    ])
  })

  it('other jobs split what they track by whether it went wrong, keeping a list’s Stop', () => {
    const tracked = [
      { name: 'Star-K', status: 'Read last night', bad: false, page: '', watch: { id: 'w', active: true } },
      { name: 'Hamotzi', status: 'Didn’t load', bad: true, page: 'place/h' },
    ]
    const { missing, read } = jobPlaceRows('kosher', { tracked })
    expect(read).toEqual([{ key: 'Star-K-0', name: 'Star-K', line: 'Read last night', page: null, watch: { id: 'w', active: true } }])
    expect(missing).toEqual([{ key: 'Hamotzi-1', name: 'Hamotzi', line: 'Didn’t load', page: 'place/h' }])
  })
})
