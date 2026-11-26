import { describe, expect, it } from 'vitest'
import { readFromRows, type ReadFromIn } from './readFrom'

const base: ReadFromIn = { kind: 'shuls', website: null, site: null, canRead: false, emails: [], waiting: null, communityEmail: 'guide@gmail.com', google: { matched: true }, lists: [], refuah: false }
const words = (p: Partial<ReadFromIn>) => readFromRows({ ...base, ...p }).map((r) => [r.name, r.line, r.actions.join(',')])

describe('Read from (board W3)', () => {
  it('a new shul: each empty row with its own way to fill it', () => {
    expect(words({ google: { matched: false } })).toEqual([
      ['Its website', 'Not set', 'add'],
      ['Its emails', 'Sign up as guide@gmail.com', 'copy'],
      ['Google', 'Not matched', 'find'],
    ])
  })

  it('a shul read from its website and emails', () => {
    expect(words({ website: 'https://www.mekor.org/', site: { ok: true }, canRead: true, emails: [{ sender: 'news@mekor.org', at: '2026-11-24T15:00:00Z' }] })).toEqual([
      ['Its website', 'mekor.org · every night', 'change,read'],
      ['Its emails', 'news@mekor.org · last Nov 24', ''],
      ['Google', 'Matched', ''],
    ])
  })

  it('a website that won’t open is amber, and not done', () => {
    const [row] = readFromRows({ ...base, website: 'https://kesher.org', site: { ok: false }, canRead: true })
    expect(row).toMatchObject({ done: false, amber: true, line: 'kesher.org · won’t open', actions: ['change', 'read'] })
  })

  it('an email from a sender linked to nothing: Link it; with no community email, set it up', () => {
    const waiting = { id: 'w1', sender: 'office@leyv.org' }
    expect(readFromRows({ ...base, waiting }).find((r) => r.key === 'emails')).toMatchObject({ line: 'An email from office@leyv.org came in', actions: ['link'], link: waiting })
    expect(readFromRows({ ...base, communityEmail: null }).find((r) => r.key === 'emails')).toMatchObject({ line: 'Needs the community email', actions: ['setup'] })
  })

  it('an eruv: emails, and Google not for an eruv', () => {
    expect(words({ kind: 'eruv', google: undefined, website: 'https://pikesvilleeruv.org', site: { ok: true } })).toEqual([
      ['Its website', 'pikesvilleeruv.org · every night', 'change'],
      ['Its emails', 'Sign up as guide@gmail.com', 'copy'],
      ['Google', 'Not for an eruv', ''],
    ])
  })

  it('an eruv whose status comes from a page takes no email for it', () => {
    expect(words({ kind: 'eruv', google: undefined, statusPage: 'https://www.centercityeruv.com/' })[1]).toEqual(['Its status', 'From centercityeruv.com', ''])
  })

  it('food: no emails; its menu, and the kosher lists it’s on, shown only', () => {
    expect(words({ kind: 'food', menu: null, lists: ['Keystone-K’s list', 'KCL’s list'] })).toEqual([
      ['Its website', 'Not set', 'add'],
      ['Google', 'Matched', ''],
      ['Its menu', 'Not set', 'add'],
      ['Kosher lists', 'On Keystone-K’s list and KCL’s list', ''],
    ])
  })

  it('a kind with no website field has no website row', () => {
    expect(readFromRows({ ...base, website: undefined })[0].key).toBe('emails')
  })

  it('a hospital: Refuah, shown only', () => {
    expect(words({ kind: 'hospitals', refuah: true, google: undefined }).at(-1)).toEqual(['Refuah', 'Its page on Refuah', ''])
  })
})
