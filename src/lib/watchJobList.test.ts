import { describe, expect, it } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'
import type { NightKindView } from './nightKinds'
import { jobLists, lastRunWord, needsFixing, watchesSentence } from './watchJobList'

const view = (over: Partial<NightKindView>): NightKindView => ({ id: 'google', name: 'Google', about: '', when: null, count: '', trouble: null, misses: [], tracked: [], nights: [], fixes: [], lastAt: null, schedule: '', ...over })
const tracked = [{ name: 'x', status: '', bad: false, page: '' }]
const shuls = makeCategory({
  id: 'synagogue',
  kind: 'listing',
  detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }],
} as never)
const eruv = makeCategory({ id: 'eruvin', kind: 'eruv' })
const map = makeCategory({ id: 'map', kind: 'map' } as never)

describe('which jobs a community sees', () => {
  it('a job with nothing to read yet needs its step; one with something is a job', () => {
    const lists = jobLists([shuls], [view({ id: 'times', name: 'Minyan times', tracked })], [])
    expect(lists.jobs.map((j) => j.id)).toContain('times')
    expect(lists.steps.map((s) => s.id)).toContain('newsletters')
    expect(lists.steps.find((s) => s.id === 'newsletters')?.step).toBe('Sign up with this address')
  })

  it('a job with no kind of place here shows nowhere', () => {
    const { jobs, steps, more } = jobLists([eruv, map], [], [])
    const ids = [...jobs, ...steps, ...more].map((j) => j.id)
    expect(ids).toContain('eruvs')
    for (const absent of ['times', 'hours', 'hospitals', 'kosher', 'menus', 'newsletters', 'google']) expect(ids).not.toContain(absent)
  })

  it('a job turned off goes under Add a watch, and leaves the rest', () => {
    const { jobs, more } = jobLists([shuls], [view({ id: 'times', name: 'Minyan times', tracked })], ['times'])
    expect(jobs.map((j) => j.id)).not.toContain('times')
    expect(more).toContainEqual({ id: 'times', name: expect.any(String), off: true })
  })

  it('Other pages is always offered, under Add a watch', () => {
    expect(jobLists([], [], []).more.map((m) => m.id)).toEqual(['other'])
  })
})

describe('Needs fixing', () => {
  it('a job failing is one line for every kind it reads, and a place keeps its own', () => {
    const whole = { why: 'Last run failed', page: 'job/x', whole: true, name: '' }
    const fixes = needsFixing([
      { id: 'times', name: 'Minyan times', fixes: [{ ...whole, name: 'Minyan times' }, { name: 'LMS', why: 'Page didn’t open, 3 nights', page: 'kind/s?place=l' }] },
      { id: 'eruvs', name: 'Eruvs', fixes: [{ ...whole, name: 'Eruvs' }] },
    ])
    expect(fixes.map((f) => [f.name, f.why])).toEqual([
      ['Minyan times and Eruvs', 'Last run failed'],
      ['LMS', 'Page didn’t open, 3 nights'],
    ])
  })
})

describe('the sentence at the top', () => {
  it('explains itself only until a job has run', () => {
    expect(watchesSentence([{ lastAt: null }], 0)).toEqual({ tone: 'new', text: 'Watches read the web each night and bring you what changed.' })
    expect(watchesSentence([{ lastAt: '2026-10-30T07:00:00Z' }], 0)).toEqual({ tone: 'good', text: 'All fine. Nothing to fix.' })
  })

  it('counts what needs fixing', () => {
    expect(watchesSentence([{ lastAt: 'x' }], 1).text).toBe('1 thing needs fixing. The rest is fine.')
    expect(watchesSentence([{ lastAt: 'x' }], 2).text).toBe('2 things need fixing. The rest is fine.')
    expect(watchesSentence([{ lastAt: null }], 1).tone).toBe('bad')
  })
})

describe('when a job last ran', () => {
  const now = Date.parse('2026-10-31T14:00:00Z')
  it('a nightly job', () => {
    expect(lastRunWord('2026-10-31T07:00:00Z', now, true)).toBe('Last night')
    expect(lastRunWord('2026-10-27T07:00:00Z', now, true)).toBe('Tuesday')
    expect(lastRunWord('2026-10-12T07:00:00Z', now, true)).toBe('Oct 12')
  })
  it('one that isn’t', () => {
    expect(lastRunWord('2026-10-31T13:00:00Z', now, false)).toBe('Today')
    expect(lastRunWord('2026-10-30T13:00:00Z', now, false)).toBe('Yesterday')
    expect(lastRunWord('2026-10-25T13:00:00Z', now, false)).toBe('Sunday')
  })
})
