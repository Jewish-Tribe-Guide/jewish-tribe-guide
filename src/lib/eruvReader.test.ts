import { describe, expect, it, vi } from 'vitest'
import { readEruvPage, refreshStale } from './eruvReader'
import type { Eruv } from './eruv'

const NOW = new Date('2026-10-09T19:00:00Z') // Fri 3 PM in Philadelphia
const page = (html: string, status = 200) => vi.fn(async () => new Response(html, { status })) as unknown as typeof fetch

function eruv(over: Partial<Eruv> = {}): Eruv {
  return {
    id: 'university-city', name: 'University City Eruv', covers: null, website: null, hotline: null, alertsUrl: null,
    statusUrl: 'https://www.pennocp.org/eruv', statusDated: false, status: 'up', statusWords: 'The Eruv is Up!', statusPostedOn: null,
    statusCheckedAt: '2026-10-09T18:30:00Z', statusErrorAt: null, statusError: null, ...over,
  }
}

describe('readEruvPage', () => {
  it('reads the status sentence', async () => {
    expect(await readEruvPage('u', NOW, page('<h2>The Eruv is Up!</h2><p>Project Overview</p>'))).toEqual({ ok: true, status: 'up', words: 'The Eruv is Up!', postedOn: null, at: NOW.toISOString() })
  })
  it('a page with nothing clear, an error status, or no answer is a failed read', async () => {
    expect(await readEruvPage('u', NOW, page('<p>Welcome</p>'))).toMatchObject({ ok: false, error: 'No status sentence on the page' })
    expect(await readEruvPage('u', NOW, page('gone', 503))).toMatchObject({ ok: false, error: 'The page answered 503' })
    const failing = vi.fn(async () => { throw new Error('timed out') }) as unknown as typeof fetch
    expect(await readEruvPage('u', NOW, failing)).toMatchObject({ ok: false, error: 'timed out' })
  })
})

describe('refreshStale', () => {
  it('reads only the stale pages, saves each read, and shows it', async () => {
    const fetchImpl = page('<p>The Eruv is DOWN.</p>')
    const save = vi.fn(async () => {})
    const fresh = eruv({ id: 'fresh', statusCheckedAt: '2026-10-09T18:55:00Z' })
    const stale = eruv({ id: 'stale' })
    const hotline = eruv({ id: 'hotline', statusUrl: null })
    const out = await refreshStale([fresh, stale, hotline], { now: NOW, timezone: 'America/New_York', candles: 18 * 60 + 12, save, fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('stale', expect.objectContaining({ ok: true, status: 'down' }))
    expect(out.map((e) => [e.id, e.status])).toEqual([['fresh', 'up'], ['stale', 'down'], ['hotline', 'up']])
  })

  it('a failed read keeps the last status and records the failure', async () => {
    const out = await refreshStale([eruv()], { now: NOW, timezone: 'America/New_York', candles: 18 * 60 + 12, save: async () => {}, fetchImpl: page('', 500) })
    expect(out[0]).toMatchObject({ status: 'up', statusCheckedAt: '2026-10-09T18:30:00Z', statusErrorAt: NOW.toISOString(), statusError: 'The page answered 500' })
  })
})
