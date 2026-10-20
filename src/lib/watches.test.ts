import { describe, expect, it } from 'vitest'
import { afterRun, listCheck, kindForUrl, normalizeWatchUrl, STALE_AFTER_MS, watchHealth, type CheckFound, type Watch } from './watches'

const NOW = '2026-10-06T07:00:00.000Z'
const DAY = 86_400_000

function watch(over: Partial<Watch> = {}): Watch {
  return {
    id: 'w1',
    communityId: 'philly',
    kind: 'website',
    url: 'https://example.org/',
    resourceId: null,
    label: null,
    active: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    createdBy: null,
    lastRunAt: null,
    lastOkAt: null,
    lastError: null,
    failingSince: null,
    lastFiled: null,
    pageHash: null,
    pageChangedAt: null,
    lastCheck: null,
    ...over,
  }
}

describe('normalizeWatchUrl', () => {
  it('accepts an address typed without https', () => {
    expect(normalizeWatchUrl('  lowermerionsynagogue.org ')).toBe('https://lowermerionsynagogue.org/')
  })
  it('drops the fragment', () => {
    expect(normalizeWatchUrl('https://bzbi.org/worship/#times')).toBe('https://bzbi.org/worship/')
  })
  it('refuses what is not a web page', () => {
    expect(normalizeWatchUrl('')).toBeNull()
    expect(normalizeWatchUrl('mailto:rabbi@example.org')).toBeNull()
    expect(normalizeWatchUrl('not a url')).toBeNull()
    expect(normalizeWatchUrl('localhost')).toBeNull()
  })
})

describe('kindForUrl', () => {
  it('reads Keystone-K’s list entry by entry, however it was typed', () => {
    expect(kindForUrl('https://keystone-k.org/establishments/')).toBe('keystone_list')
    expect(kindForUrl('https://www.keystone-k.org/establishments')).toBe('keystone_list')
  })
  it('watches any other page for changes', () => {
    expect(kindForUrl('https://keystone-k.org/kosher/cherry-grill/')).toBe('website')
    expect(kindForUrl('https://www.mekorhabracha.org/davening')).toBe('website')
  })
})

describe('afterRun', () => {
  it('emails once when a working watch breaks, and not again while it stays broken', () => {
    const first = afterRun(watch(), { ok: false, error: 'The page answered 403' }, NOW)
    expect(first.alert).toBe('broke')
    expect(first.update).toMatchObject({ lastRunAt: NOW, lastError: 'The page answered 403', failingSince: NOW })
    expect(first.update.lastOkAt).toBeUndefined()

    const second = afterRun(watch({ failingSince: NOW }), { ok: false, error: 'The page answered 403' }, '2026-10-07T07:00:00.000Z')
    expect(second.alert).toBeNull()
    expect(second.update.failingSince).toBe(NOW) // still since the first failure
  })

  it('emails once when a broken watch works again, and clears the error', () => {
    const { update, alert } = afterRun(watch({ failingSince: NOW, lastError: 'x' }), { ok: true, filed: 2 }, NOW)
    expect(alert).toBe('recovered')
    expect(update).toMatchObject({ lastOkAt: NOW, lastError: null, failingSince: null, lastFiled: 2 })
  })

  it('says nothing on an ordinary good run', () => {
    expect(afterRun(watch(), { ok: true, filed: 0 }, NOW).alert).toBeNull()
  })

  it('takes the first read of a page as the baseline, not a change', () => {
    const { update } = afterRun(watch(), { ok: true, filed: 0, pageHash: 'aaa' }, NOW)
    expect(update.pageHash).toBe('aaa')
    expect(update.pageChangedAt).toBeUndefined()
  })

  it('marks the day a page’s words changed, and only then', () => {
    expect(afterRun(watch({ pageHash: 'aaa' }), { ok: true, filed: 0, pageHash: 'bbb' }, NOW).update.pageChangedAt).toBe(NOW)
    expect(afterRun(watch({ pageHash: 'aaa' }), { ok: true, filed: 0, pageHash: 'aaa' }, NOW).update.pageChangedAt).toBeUndefined()
  })

  it('keeps the last fingerprint when a read fails, so a failure is never a change', () => {
    expect(afterRun(watch({ pageHash: 'aaa' }), { ok: false, error: 'down' }, NOW).update.pageHash).toBeUndefined()
  })

  // The user, Oct 20: what a full read found stays on the row until the
  // next one; a run that only fingerprinted the page leaves it be.
  it('keeps what a full read found, dated, and leaves it be after a run that read nothing', () => {
    const check: CheckFound = { what: 'times', from: 'page', result: 'agrees', read: ['Shacharis Mon–Fri 7:00 AM'], differences: [], queue: null }
    expect(afterRun(watch(), { ok: true, filed: 0, pageHash: 'a', check }, NOW).update.lastCheck).toEqual({ ...check, at: NOW })
    expect(afterRun(watch(), { ok: false, error: 'down', check: { ...check, result: 'unreadable', read: [] } }, NOW).update.lastCheck).toMatchObject({ result: 'unreadable', at: NOW })
    expect('lastCheck' in afterRun(watch(), { ok: true, filed: 0, pageHash: 'a' }, NOW).update).toBe(false)
  })
})

describe('listCheck', () => {
  it('says how many the list has, how many match, how many differ and how many it filed', () => {
    expect(listCheck({ entries: 78, matching: 74, findings: 4, filed: 1 })).toEqual({
      what: 'list',
      from: null,
      result: 'differs',
      read: [],
      differences: [],
      queue: 'filed',
      list: { listed: 78, matching: 74, differences: 4, filed: 1 },
    })
    expect(listCheck({ entries: 78, matching: 74, findings: 4, filed: 0 }).queue).toBe('before')
    expect(listCheck({ entries: 54, matching: 54, findings: 0, filed: 0 })).toMatchObject({ result: 'agrees', queue: null })
  })
})

describe('watchHealth', () => {
  const now = Date.parse(NOW)
  it('is waiting before its first run, and paused when paused', () => {
    expect(watchHealth(watch(), now).state).toBe('waiting')
    expect(watchHealth(watch({ active: false, lastRunAt: NOW }), now).state).toBe('paused')
  })
  it('is working after a good run', () => {
    expect(watchHealth(watch({ lastRunAt: NOW, lastOkAt: NOW }), now)).toEqual({ state: 'working', since: NOW })
  })
  it('is failing, with the reason, after a bad one', () => {
    expect(watchHealth(watch({ lastRunAt: NOW, failingSince: NOW, lastError: 'The page answered 403' }), now)).toEqual({
      state: 'failing',
      since: NOW,
      error: 'The page answered 403',
    })
  })
  // The daily cron itself can stop (a deploy, a plan limit): nothing fails,
  // nothing runs, and the last result would look fine forever.
  it('is stale when it hasn’t run in two days, even if its last run worked', () => {
    const ran = new Date(now - STALE_AFTER_MS - 60_000).toISOString()
    expect(watchHealth(watch({ lastRunAt: ran, lastOkAt: ran }), now).state).toBe('stale')
    const yesterday = new Date(now - DAY).toISOString()
    expect(watchHealth(watch({ lastRunAt: yesterday, lastOkAt: yesterday }), now).state).toBe('working')
  })
})
