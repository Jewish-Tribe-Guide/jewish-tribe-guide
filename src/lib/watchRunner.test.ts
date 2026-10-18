import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NEWSLETTER_WATCH_CREATOR } from './newsletter'

// A newsletter sender's watch in the daily run: nothing fetched, only
// whether its newsletter has gone quiet (newsletter.ts).
const m = vi.hoisted(() => ({ readWebsite: vi.fn() }))
vi.mock('./keystoneRun', () => ({ runKeystoneWatch: vi.fn() }))
vi.mock('./refuahRun', () => ({ runRefuahWatch: vi.fn() }))
const mekor = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('./mekorRun', () => ({ runMekorWatch: mekor.run }))
vi.mock('./menuWatchRun', () => ({ runMenuWatch: vi.fn() }))
vi.mock('./websiteWatch', () => ({ readWebsite: m.readWebsite }))
vi.mock('./watchStore', () => ({ updateWatch: vi.fn() }))

const { runWatch } = await import('./watchRunner')
const now = Date.parse('2026-11-20T12:00:00Z')
const sender = { communityId: 'philly', kind: 'website' as const, url: 'mailto:info@mekor.org', createdBy: NEWSLETTER_WATCH_CREATOR, createdAt: '2026-10-01T00:00:00Z' }

beforeEach(() => vi.resetAllMocks())

describe('runWatch: a newsletter', () => {
  it('works while it keeps coming, keeping what the last one filed', async () => {
    expect(await runWatch({ ...sender, pageChangedAt: '2026-11-13T00:00:00Z', lastFiled: 2 }, undefined, now)).toEqual({ ok: true, filed: 2 })
    expect(m.readWebsite).not.toHaveBeenCalled()
  })

  it('fails once it has gone a month without one, so the admin is told', async () => {
    expect(await runWatch({ ...sender, pageChangedAt: '2026-10-15T00:00:00Z' }, undefined, now)).toEqual({ ok: false, error: 'No newsletter from them since Oct 15' })
    expect(await runWatch({ ...sender, pageChangedAt: null }, undefined, now)).toEqual({ ok: false, error: 'No newsletter from them since it was linked, Oct 1' })
  })
})

// Mekor Habracha's kosher list is a website watch (no migration gave it a
// kind of its own): its address is what makes it read place by place.
describe('runWatch: Mekor Habracha’s list', () => {
  const mekorList = { communityId: 'philly', kind: 'website' as const, url: 'https://www.mekorhabracha.org/center-city' }

  it('is read place by place, not watched for a change', async () => {
    mekor.run.mockResolvedValue({ ok: true, entries: 78, findings: 18, filed: 18, closedOnGoogle: [] })
    expect(await runWatch(mekorList)).toEqual({ ok: true, filed: 18 })
    expect(mekor.run).toHaveBeenCalledWith('philly', mekorList.url)
    expect(m.readWebsite).not.toHaveBeenCalled()
  })

  it('says why when it couldn’t be read', async () => {
    mekor.run.mockResolvedValue({ ok: false, error: 'Mekor Habracha’s list answered 503' })
    expect(await runWatch(mekorList)).toEqual({ ok: false, error: 'Mekor Habracha’s list answered 503' })
  })
})
