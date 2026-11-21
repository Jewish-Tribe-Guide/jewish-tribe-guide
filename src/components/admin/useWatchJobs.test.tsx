// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Activity, useState } from 'react'
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
vi.unmock('@/components/admin/fetchJobs')
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

// ─────────────────────────────────────────────────────────────────────────────
// A save waits for the jobs it changed, not all thirteen.
//
// Every save on a place used to read all thirteen jobs again, at once, and
// show "Saving…" until the last came back: 4.4s for one Accept on a laptop,
// over 5s in CI, where the admin tests failed on it all of Nov 16. Raising
// their waits hid it; this is what was slow.
// ─────────────────────────────────────────────────────────────────────────────

// Each request the hook makes: the jobs it asks for, and its answer.
type Pending = { url: string; keys: string[]; answer: (body: unknown) => void }
let pending: Pending[] = []

function answering() {
  pending = []
  vi.mocked(fetchJson).mockImplementation((url: string) => {
    const only = new URL(url, 'http://x').searchParams.get('only')
    return new Promise((resolve) => pending.push({ url, keys: only ? only.split(',') : [...ALL_JOBS], answer: resolve }))
  })
}
/** The jobs asked for by each request still waiting. */
const asked = () => pending.map((p) => p.keys)
const answer = async (jobs: Record<string, unknown> = {}) => {
  const p = pending.shift()
  expect(p, 'a request was made').toBeDefined()
  await act(async () => p!.answer({ ok: true, jobs }))
}
const answerAll = async () => {
  while (pending.length) await answer()
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
  it('reads every job in one request, not thirteen the browser queues', async () => {
    answering()
    renderWithProviders(<Probe />)
    expect(pending.map((p) => new URL(p.url, 'http://x').pathname)).toEqual(['/api/admin/watches/jobs'])
    expect(asked()).toEqual([ALL_JOBS])
    await answer({ dishes: { places: [{ id: 'p', name: 'P', href: '' }] }, runs: { kinds: [] } })
    expect(hook.jobs.dishes).toEqual([{ id: 'p', name: 'P', href: '' }])
    // What the request didn't bring back failed, rather than loading forever.
    expect(hook.jobs.links).toBeNull()
  })

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
    expect(asked()).toEqual([['dishes']])
    await answer({ dishes: { places: [{ id: 'p', name: 'P', href: '' }] } })
    await reloading
    expect(done).toBe(true)
    expect(hook.jobs.dishes).toEqual([{ id: 'p', name: 'P', href: '' }])
    // The rest, read again behind it.
    expect(asked()).toEqual([ALL_JOBS.filter((k) => k !== 'dishes')])
    await answerAll()
  })

  it('with nothing named, waits for every job', async () => {
    answering()
    renderWithProviders(<Probe />)
    await answerAll()

    let done = false
    act(() => void hook.reload().then(() => void (done = true)))
    expect(asked()).toEqual([ALL_JOBS])
    expect(done).toBe(false)
    await answerAll()
    expect(done).toBe(true)
  })

  it('handed something else as a callback (`.then(reload)`), reads every job', async () => {
    answering()
    renderWithProviders(<Probe />)
    await answerAll()
    act(() => void (hook.reload as (x: unknown) => Promise<void>)({ ok: true }))
    expect(asked()).toEqual([ALL_JOBS])
    await answerAll()
  })
})

describe('a screen with its own read', () => {
  it('asks for no job until its own data is in, so that read never waits behind them', async () => {
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
    expect(asked()).toEqual([ALL_JOBS])
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
  it('a read that started before the switch doesn’t put the job back as it was', async () => {
    // job-off (admin-write, Nov 16): Links turned back on, and Watches
    // still showed it off. Add a watch's own read, asked before the
    // switch, came back after it with the old list.
    answering()
    renderWithProviders(<Probe />)
    await answer({ runs: { available: true, kinds: [{ id: 'links' }], off: ['links'] } })
    act(() => void hook.reload())
    noteJobSwitched('test-community', 'links', false)
    // With another job in the same answer: the screen's whole list is
    // remembered again when it changes, so its own copy must follow too.
    await answer({ runs: { available: true, kinds: [{ id: 'links' }], off: ['links'] }, dishes: { places: [] } })
    expect(hook.jobs.runs?.off).toEqual([])
    cleanup()

    answering()
    renderWithProviders(<Probe />)
    expect(hook.jobs.runs?.off).toEqual([])
    await answerAll()
  })

  it('a screen kept hidden while the job was switched shows the switch when it comes back', async () => {
    // job-off (admin-write, PR 405's first CI run, Nov 20): Links turned
    // back on from Add a watch, and Watches still showed it off. Next keeps
    // a route it left behind React's <Activity>, hidden with its state and
    // its effects off, so the Watches that came back was the one from
    // before Add a watch: it had missed the switch, and showed the job off
    // until its own read again came back, over 5s on CI's busy test project.
    answering()
    let watches: Hook | undefined
    let show: (shown: boolean) => void = () => {}
    const keepWatches = (h: Hook) => void (watches = h)
    const keepShow = (s: (shown: boolean) => void) => void (show = s)
    function Kept() {
      keepWatches(useWatchJobsAndReload('t'))
      return null
    }
    function Shell() {
      const [shown, setShown] = useState(true)
      keepShow(setShown)
      return <Activity mode={shown ? 'visible' : 'hidden'}><Kept /></Activity>
    }
    renderWithProviders(<Shell />)
    await answer({ runs: { available: true, kinds: [{ id: 'links' }], off: ['links'] } })
    expect(watches!.jobs.runs?.off).toEqual(['links'])

    act(() => show(false)) // to Add a watch
    noteJobSwitched('test-community', 'links', false) // turned on there
    act(() => show(true)) // back on Watches
    expect(pending.length, 'it reads again on coming back').toBe(1)
    expect(watches!.jobs.runs?.off).toEqual([])
    await answerAll()
    cleanup()

    // And what it remembers for the next screen isn't its old copy.
    answering()
    renderWithProviders(<Probe />)
    expect(hook.jobs.runs?.off).toEqual([])
    await answerAll()
  })

  it('Watches opens showing the job as just switched, before it reads again', async () => {
    answering()
    renderWithProviders(<Probe />)
    await answer({ runs: { available: true, kinds: [{ id: 'links' }], off: [] } })
    cleanup()

    noteJobSwitched('test-community', 'links', true)
    answering()
    renderWithProviders(<Probe />)
    expect(hook.jobs.runs?.off).toEqual(['links'])
    await answerAll()
  })
})
