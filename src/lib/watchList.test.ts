import { describe, expect, it } from 'vitest'
import type { NightKindView } from './nightKinds'
import { NIGHT_KINDS } from './nightKinds'
import { findWatches, fitsPlaceWatch, isPlaceSourceChoice, isPlaceWatchChoice, listedJobs, placeWatches, placeWatchLine, sourceChoices, WATCH_JOBS, watchAside, watchJobOf, watchSources, watchState } from './watchList'
import type { FieldCoverage } from './fieldCoverage'

const view = (over: Partial<NightKindView>): NightKindView => ({ id: 'times', name: '', about: '', when: null, count: '', trouble: null, misses: [], tracked: [], nights: [], fixes: [], lastAt: null, schedule: '', ...over })
const read = (name: string) => ({ name, status: 'Read', bad: false, page: '' })
const job = (id: string) => WATCH_JOBS.find((j) => j.id === id)!

describe('the Watches jobs', () => {
  it('every nightly job is in exactly one of them', () => {
    for (const k of NIGHT_KINDS) expect(WATCH_JOBS.filter((j) => j.kinds.includes(k.id)).map((j) => j.name), k.id).toHaveLength(1)
  })

  it('in the drawn order, under what visitors see', () => {
    expect(listedJobs([]).map((j) => `${j.heading}: ${j.name}`)).toEqual([
      'Every place: Basic information',
      'Shuls: Minyan times',
      'Food: Menus',
      'Food: Kosher certification',
      'Mikvahs: Mikvah hours',
      'Hospitals: Bikkur Cholim details',
      'Eruv: Eruv status',
      'Links: Broken links',
    ])
    expect(listedJobs([view({ id: 'other', tracked: [read('a.org')] })]).at(-1)?.name).toBe('Other pages')
  })

  it('an old address opens the job it is part of', () => {
    expect(watchJobOf('newsletters')?.name).toBe('Minyan times')
    expect(watchJobOf('sites')?.name).toBe('Basic information')
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
  it('each kosher list is a source', () => {
    expect(watchSources(job('kosher'), kosher).map((s) => s.label)).toEqual(['Keystone-K’s list', 'KCL’s list'])
  })

  it('finds a job by its name, or by a source it reads', () => {
    const jobs = listedJobs(kosher)
    expect(findWatches('minyan', jobs, kosher)).toEqual([{ job: job('times'), line: null }])
    expect(findWatches('google', jobs, kosher)).toEqual([{ job: job('google'), line: 'From Google' }])
    expect(findWatches('kcl', jobs, kosher)).toEqual([{ job: job('kosher'), line: 'From KCL’s list' }])
    expect(findWatches('refuah', jobs, kosher).map((r) => r.job.name)).toEqual(['Bikkur Cholim details'])
    expect(findWatches('  ', jobs, kosher)).toEqual([])
  })
})

describe('a place, by the jobs that check it', () => {
  const f = (key: string, by: FieldCoverage['by'], main = false): FieldCoverage => ({ key, label: key, by, main })
  it('a website read for times is Minyan times; for a phone, Basic information', () => {
    const shul = placeWatches({ fields: [f('times', ['website', 'newsletter'], true), f('phone', ['google']), f('email', ['website'])], lists: [] })
    expect(shul).toEqual({ jobs: ['google', 'times'], sources: ['website', 'newsletter', 'google'] })
    expect(placeWatchLine(shul.jobs)).toBe('Basic information · Minyan times')
  })
  it('a mikvah’s hours, a menu, a hechsher by its lists, Refuah, links', () => {
    expect(placeWatches({ fields: [f('hours', ['website'], true)], lists: [] }).jobs).toEqual(['hours'])
    expect(placeWatches({ fields: [f('hours', ['website'])], lists: [] }).jobs).toEqual(['google'])
    expect(placeWatches({ fields: [f('menu', ['website']), f('hechsher', ['certifier'], true)], lists: ['KCL’s list'] })).toEqual({ jobs: ['menus', 'kosher'], sources: ['website', 'list:KCL’s list'] })
    expect(placeWatches({ fields: [f('hospital', ['refuah'], true), f('website', ['links'])], lists: [] })).toEqual({ jobs: ['hospitals', 'links'], sources: ['refuah'] })
    expect(placeWatches({ fields: [f('hechsher', [], true)], lists: [] })).toEqual({ jobs: [], sources: [] })
  })
  it('the menus: a job, Nothing, a source; both at once', () => {
    const w = { jobs: ['google', 'kosher'] as const, sources: ['google', 'list:KCL’s list'] as const, unchecked: true }
    expect(fitsPlaceWatch(w, 'any', 'any')).toBe(true)
    expect(fitsPlaceWatch(w, 'kosher', 'list:KCL’s list')).toBe(true)
    expect(fitsPlaceWatch(w, 'times', 'any')).toBe(false)
    expect(fitsPlaceWatch(w, 'nothing', 'any')).toBe(true)
    expect(fitsPlaceWatch({ ...w, unchecked: false }, 'nothing', 'any')).toBe(false)
    expect(fitsPlaceWatch(w, 'any', 'newsletter')).toBe(false)
    expect(fitsPlaceWatch(undefined, 'any', 'any')).toBe(true)
    expect(fitsPlaceWatch(undefined, 'nothing', 'any')).toBe(false)
  })
  it('what an address may ask for, and the sources in the drawn order', () => {
    expect([isPlaceWatchChoice('times'), isPlaceWatchChoice('nothing'), isPlaceWatchChoice('nope')]).toEqual([true, true, false])
    expect([isPlaceSourceChoice('list:KCL’s list'), isPlaceSourceChoice('list:'), isPlaceSourceChoice('refuah'), isPlaceSourceChoice('x')]).toEqual([true, false, true, false])
    expect(sourceChoices(['refuah', 'list:KCL’s list', 'newsletter', 'google', 'website', 'list:Keystone-K’s list'])).toEqual(['google', 'website', 'newsletter', 'list:KCL’s list', 'list:Keystone-K’s list', 'refuah'])
  })
})
