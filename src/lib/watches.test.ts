import { describe, expect, it } from 'vitest'
import { afterRun, kindForUrl, normalizeWatchUrl, STALE_AFTER_MS, watchHealth, type Watch } from './watches'

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
