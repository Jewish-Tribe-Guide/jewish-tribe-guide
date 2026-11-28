import { describe, expect, it } from 'vitest'
import type { NightKindView } from './nightKinds'
import { NIGHT_KINDS } from './nightKinds'
import { findWatches, listedJobs, WATCH_JOBS, watchAside, watchJobOf, watchLine, watchSources, watchState } from './watchList'

const view = (over: Partial<NightKindView>): NightKindView => ({ id: 'times', name: '', about: '', when: null, count: '', trouble: null, misses: [], tracked: [], nights: [], fixes: [], lastAt: null, schedule: '', ...over })
const read = (name: string) => ({ name, status: 'Read', bad: false, page: '' })
const job = (id: string) => WATCH_JOBS.find((j) => j.id === id)!

describe('the Watches jobs', () => {
  it('every nightly job is in exactly one of them', () => {
    for (const k of NIGHT_KINDS) expect(WATCH_JOBS.filter((j) => j.kinds.includes(k.id)).map((j) => j.name), k.id).toHaveLength(1)
  })

  it('in the drawn order, under what visitors see', () => {
    expect(listedJobs([]).map((j) => `${j.heading}: ${j.name}`)).toEqual([
      'Every place: Hours and phone',
      'Shuls: Minyan times',
      'Food: Menus',
      'Food: Kosher certification',
      'Mikvahs: Mikvah hours',
      'Hospitals: Hospital details',
      'Eruv: Eruv status',
      'Links: Broken links',
    ])
    expect(listedJobs([view({ id: 'other', tracked: [read('a.org')] })]).at(-1)?.name).toBe('Other pages')
  })

  it('an old address opens the job it is part of', () => {
    expect(watchJobOf('newsletters')?.name).toBe('Minyan times')
    expect(watchJobOf('sites')?.name).toBe('Hours and phone')
    expect(watchJobOf('nope')).toBeUndefined()
  })
})

describe('watchState and its row', () => {
  const times = job('times')
  it('off only when both its jobs are off, with the last read', () => {
    const views = [view({ lastAt: '2026-11-26T12:00:00Z' }), view({ id: 'newsletters', lastAt: '2026-11-27T12:00:00Z' })]
    expect(watchState(times, views, ['times']).state).toBe('on')
    expect(watchState(times, views, ['times', 'newsletters'])).toEqual({ state: 'off', lastAt: '2026-11-27T12:00:00Z' })
    expect(watchAside(times, watchState(times, views, ['times', 'newsletters']))).toEqual({ text: 'Off', bad: false })
  })

  it('new: nothing read, never run, says when it runs', () => {
    const s = watchState(times, [view({})], [])
    expect(s).toEqual({ state: 'new' })
    expect(watchAside(times, s)?.text).toBe('Runs once the first shul has a website or newsletter')
    expect(watchAside(job('kosher'), watchState(job('kosher'), [], []))?.text).toBe('Runs when a kosher list is added')
  })

  it('running well says nothing; a job not running says why', () => {
    expect(watchAside(times, watchState(times, [view({ lastAt: '2026-11-27T12:00:00Z' })], []))).toBeNull()
    const late = view({ lastAt: '2026-11-20T12:00:00Z', fixes: [{ name: '', page: '', why: 'Not since Nov 20', whole: true }] })
    expect(watchAside(times, watchState(times, [late], []))).toEqual({ text: 'Not since Nov 20', bad: true })
  })
})

describe('sources and search', () => {
  const kosher = [view({ id: 'kosher', tracked: [read('Keystone-K’s list'), read('KCL’s list'), read('Keystone-K’s list')] })]
  it('each kosher list is a source, and the line names them', () => {
    expect(watchSources(job('kosher'), kosher).map((s) => s.label)).toEqual(['Keystone-K’s list', 'KCL’s list'])
    expect(watchLine(job('kosher'), kosher)).toBe('From Keystone-K’s and KCL’s lists, every night.')
    expect(watchLine(job('kosher'), [])).toBe('From each kosher agency’s list, every night.')
  })

  it('finds a job by its name, or by a source it reads', () => {
    const jobs = listedJobs(kosher)
    expect(findWatches('minyan', jobs, kosher)).toEqual([{ job: job('times'), line: null }])
    expect(findWatches('google', jobs, kosher)).toEqual([{ job: job('google'), line: 'From Google' }])
    expect(findWatches('kcl', jobs, kosher)).toEqual([{ job: job('kosher'), line: 'From KCL’s list' }])
    expect(findWatches('refuah', jobs, kosher).map((r) => r.job.name)).toEqual(['Hospital details'])
    expect(findWatches('  ', jobs, kosher)).toEqual([])
  })
})
