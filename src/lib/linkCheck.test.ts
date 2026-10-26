import { describe, expect, it } from 'vitest'
import { answerOf, checkedRecord, linkBroken, linkCheckUrl, linksToCheck, linkStatus, standingOf } from './linkCheck'
import type { Watch } from './watches'

const NOW = Date.parse('2026-10-25T14:00:00Z')
const DAY = 86_400_000
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()

const category = {
  detailFields: [
    { key: 'website', label: 'Website', type: 'url' },
    { key: 'kosher_url', label: 'Kosher Certification URL', type: 'url' },
    { key: 'menu_url', label: 'Menu', type: 'url' },
    { key: 'whatsapp', label: 'Join group', type: 'url' },
    { key: 'notes', label: 'Notes', type: 'text' },
  ],
} as unknown as Parameters<typeof linksToCheck>[1]

const watch = (over: Partial<Watch>) => ({ url: 'https://elsewhere.org/', active: true, resourceId: null, createdBy: 'admin', ...over })

describe('which links are checked', () => {
  const details = {
    website: 'https://kosherplace.com',
    kosher_url: 'https://keystone-k.org/cert/123.pdf',
    menu_url: 'https://kosherplace.com/menu',
    whatsapp: 'https://chat.whatsapp.com/abc',
    notes: 'https://not-a-link-field.org',
  }

  it('every link field it has filled in', () => {
    expect(linksToCheck({ id: 'p1', details }, category, []).map((l) => [l.key, l.field, l.url])).toEqual([
      ['website', 'Website', 'https://kosherplace.com'],
      ['kosher_url', 'Kosher Certification URL', 'https://keystone-k.org/cert/123.pdf'],
      ['menu_url', 'Menu', 'https://kosherplace.com/menu'],
      ['whatsapp', 'Join group', 'https://chat.whatsapp.com/abc'],
    ])
  })

  it('not its website when Google keeps it', () => {
    expect(linksToCheck({ id: 'p1', details: { ...details, googleFields: ['website', 'phone'] } }, category, []).map((l) => l.key)).not.toContain('website')
  })

  it('not a link a watch opens every night, nor a website a watch of its own reads', () => {
    const watches = [watch({ url: 'https://kosherplace.com/menu/', resourceId: 'p1', createdBy: 'menu links' }), watch({ url: 'https://www.kosherplace.com/contact', resourceId: 'p1', createdBy: 'listing pages' })]
    expect(linksToCheck({ id: 'p1', details }, category, watches).map((l) => l.key)).toEqual(['kosher_url', 'whatsapp'])
  })

  it('a watch that’s stopped, or another place’s on the same site, doesn’t count', () => {
    const watches = [watch({ url: 'https://kosherplace.com/menu', resourceId: 'p1', active: false }), watch({ url: 'https://kosherplace.com/about', resourceId: 'p2' })]
    expect(linksToCheck({ id: 'p1', details }, category, watches).map((l) => l.key)).toEqual(['website', 'kosher_url', 'menu_url', 'whatsapp'])
  })

  it('nothing that isn’t a web address', () => {
    expect(linksToCheck({ id: 'p1', details: { website: 'kosherplace.com', kosher_url: 'mailto:a@b.org', whatsapp: ' ', menu_url: 3 } }, category, [])).toEqual([])
  })
})

describe('how a link answered', () => {
  it('there, or turning robots away, opens; 404 and 410 are gone; a server error is no answer', () => {
    expect([200, 204, 401, 403, 429, 404, 410, 500, 503].map(answerOf)).toEqual(['opens', 'opens', 'opens', 'opens', 'opens', 'gone', 'gone', 'no_answer', 'no_answer'])
  })
})

describe('its record', () => {
  const at = ago(0)
  it('opening clears what it said', () => {
    expect(checkedRecord({ failingSince: ago(7), lastError: 'Not found', pageHash: 'https://a.org' }, 'https://a.org', 'opens', at)).toEqual({ lastRunAt: at, lastOkAt: at, lastError: null, failingSince: null, pageHash: 'https://a.org' })
  })

  it('the same link not opening again keeps the day it first didn’t; a new link starts again', () => {
    const prev = { failingSince: ago(7), lastError: 'Didn’t answer', pageHash: 'https://a.org' }
    expect(checkedRecord(prev, 'https://a.org', 'gone', at)).toMatchObject({ lastError: 'Not found', failingSince: ago(7) })
    expect(checkedRecord(prev, 'https://b.org', 'no_site', at)).toMatchObject({ lastError: 'No such site', failingSince: at, pageHash: 'https://b.org' })
    expect(checkedRecord(null, 'https://a.org', 'no_answer', at)).toMatchObject({ lastError: 'Didn’t answer', failingSince: at })
  })

  it('a record of another link than the listing has now says nothing of it', () => {
    const link = { resourceId: 'p1', key: 'kosher_url', field: 'Kosher', url: 'https://new.org', place: 'P', category: 'food', href: '/x' }
    const record = { id: 'w1', url: linkCheckUrl('p1', 'kosher_url'), pageHash: 'https://old.org', lastRunAt: ago(1), lastError: 'Not found', failingSince: ago(1) } as Watch
    expect(standingOf(link, record)).toMatchObject({ id: 'w1', checkedAt: null, error: null, failingSince: null })
    expect(standingOf({ ...link, url: 'https://old.org' }, record)).toMatchObject({ checkedAt: ago(1), error: 'Not found', failingSince: ago(1) })
  })
})

describe('doesn’t open', () => {
  it('gone or no such site at once; not answering only on the next week’s check too', () => {
    expect(linkBroken({ error: 'Not found', failingSince: ago(0), checkedAt: ago(0) })).toBe(true)
    expect(linkBroken({ error: 'No such site', failingSince: ago(0), checkedAt: ago(0) })).toBe(true)
    expect(linkBroken({ error: 'Didn’t answer', failingSince: ago(0), checkedAt: ago(0) })).toBe(false)
    // A week on, with no check since, it's still the one check.
    expect(linkBroken({ error: 'Didn’t answer', failingSince: ago(7), checkedAt: ago(7) })).toBe(false)
    expect(linkBroken({ error: 'Didn’t answer', failingSince: ago(7), checkedAt: ago(0) })).toBe(true)
    expect(linkBroken({ error: null, failingSince: null, checkedAt: ago(0) })).toBe(false)
  })

  it('its line', () => {
    expect(linkStatus({ error: 'Not found', failingSince: ago(13), checkedAt: ago(6) })).toEqual({ text: 'Not found since Oct 12', bad: true })
    expect(linkStatus({ error: 'Didn’t answer', failingSince: ago(0), checkedAt: ago(0) })).toEqual({ text: 'Didn’t answer since Oct 25', bad: false })
    expect(linkStatus({ error: null, failingSince: null, checkedAt: ago(6) })).toEqual({ text: 'Opens · checked Oct 19', bad: false })
    expect(linkStatus({ error: null, failingSince: null, checkedAt: null })).toEqual({ text: 'Not checked yet', bad: false })
  })
})
