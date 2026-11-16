// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, cleanup } from '@testing-library/react'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import { ALL_JOBS, forgetWatchJobs, jobsChangedBy, noteJobSwitched, useWatchJobsAndReload, type Jobs } from './useWatchJobs'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

// ─────────────────────────────────────────────────────────────────────────────
// A save waits for the jobs it changed, not all thirteen.
//
// Every save on a place used to read all thirteen jobs again, at once, and
// show "Saving…" until the last came back: 4.4s for one Accept on a laptop,
// over 5s in CI, where the admin tests failed on it all of Nov 16. Raising
// their waits hid it; this is what was slow.
// ─────────────────────────────────────────────────────────────────────────────

type Pending = { path: string; answer: (body: unknown) => void }
let pending: Pending[] = []

function answering() {
  pending = []
  vi.mocked(fetchJson).mockImplementation((url: string) => {
    const path = new URL(url, 'http://x').pathname + (new URL(url, 'http://x').searchParams.has('counts') ? '?counts' : '')
    return new Promise((resolve) => pending.push({ path, answer: resolve }))
  })
}
const asked = () => pending.map((p) => p.path)
const answer = async (path: string, body: unknown) => {
  const i = pending.findIndex((p) => p.path === path)
  expect(i, `${path} was asked for`).toBeGreaterThanOrEqual(0)
  const [p] = pending.splice(i, 1)
  await act(async () => p.answer(body))
}
const answerAll = async () => {
  while (pending.length) await answer(pending[0].path, {})
}

type Hook = { jobs: Jobs; reload: (changed?: readonly (keyof Jobs)[]) => Promise<void> }
let hook: Hook
const keep = (h: Hook) => void (hook = h)
function Probe({ ready }: { ready?: boolean }) {
  keep(useWatchJobsAndReload('t', { ready }))
  return null
}

afterEach(() => {
  cleanup()
  forgetWatchJobs()
  vi.mocked(fetchJson).mockReset()
})

describe('useWatchJobsAndReload', () => {
  it('a save that changed one job is done when that job is back, and only then are the rest read', async () => {
    answering()
    renderWithProviders(<Probe />)
    await answerAll() // the first load, on mount

    let done = false
    let reloading!: Promise<void>
    act(() => {
      reloading = hook.reload(['dishes']).then(() => void (done = true))
    })
    // Only the menus are asked for: nothing else slows that read down.
    expect(asked()).toEqual(['/api/admin/main-dishes'])
    await answer('/api/admin/main-dishes', { places: [{ id: 'p', name: 'P', href: '' }] })
    await reloading
    expect(done).toBe(true)
    expect(hook.jobs.dishes).toEqual([{ id: 'p', name: 'P', href: '' }])
    // The rest, read again behind it.
    expect(asked()).toHaveLength(ALL_JOBS.length - 1)
    expect(asked()).not.toContain('/api/admin/main-dishes')
    await answerAll()
  })

  it('with nothing named, waits for every job', async () => {
    answering()
    renderWithProviders(<Probe />)
    await answerAll()

    let done = false
    act(() => void hook.reload().then(() => void (done = true)))
    expect(asked()).toHaveLength(ALL_JOBS.length)
    for (const path of asked().slice(1)) await answer(path, {})
    expect(done).toBe(false)
    await answerAll()
    expect(done).toBe(true)
  })

  it('handed something else as a callback (`.then(reload)`), reads every job', async () => {
    answering()
    renderWithProviders(<Probe />)
    await answerAll()
    act(() => void (hook.reload as (x: unknown) => Promise<void>)({ ok: true }))
    expect(asked()).toHaveLength(ALL_JOBS.length)
    await answerAll()
  })
})

describe('a screen with its own read', () => {
  it('asks for no job until its own data is in, so that read never waits behind thirteen', async () => {
    answering()
    const arrive: { now?: () => void } = {}
    const hold = (set: () => void) => void (arrive.now = set)
    function Screen() {
      const [ready, setReady] = useState(false)
      hold(() => setReady(true))
      return <Probe ready={ready} />
    }
    renderWithProviders(<Screen />)
    expect(asked()).toEqual([])
    act(() => arrive.now!())
    expect(asked()).toHaveLength(ALL_JOBS.length)
    await answerAll()
  })
})

describe('jobsChangedBy', () => {
  it('names the job a write reaches, and every job for one it does not know', () => {
    expect(jobsChangedBy('/api/admin/main-dishes')).toEqual(['dishes'])
    expect(jobsChangedBy('/api/admin/watches/google')).toEqual(['google', 'places'])
    expect(jobsChangedBy('/api/admin/watches?community=philly')).toEqual(['runs'])
    expect(jobsChangedBy('/api/admin/submissions/abc')).toEqual(ALL_JOBS)
  })
})

describe('noteJobSwitched', () => {
  it('Watches opens showing the job as just switched, before it reads again', async () => {
    answering()
    renderWithProviders(<Probe />)
    await answer('/api/admin/watches/runs', { available: true, kinds: [{ id: 'links' }], off: [] })
    await answerAll()
    cleanup()

    noteJobSwitched('test-community', 'links', true)
    answering()
    renderWithProviders(<Probe />)
    expect(hook.jobs.runs?.off).toEqual(['links'])
    await answerAll()
  })
})
