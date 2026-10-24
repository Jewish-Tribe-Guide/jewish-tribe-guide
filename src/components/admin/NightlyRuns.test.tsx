// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NIGHTLY_JOBS, type JobRun } from '@/lib/jobRuns'
import NightlyRuns, { type NightlyRunsLoaded } from './NightlyRuns'

const NOW = Date.parse('2026-10-24T14:00:00Z')
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

function run(over: Partial<JobRun>): JobRun {
  return { id: Math.random().toString(36), job: 'watches', startedAt: ago(6), finishedAt: ago(5.9), ok: true, summary: 'Checked 107 of 107 watches', warning: null, error: null, ...over }
}

function loaded(runs: Partial<Record<JobRun['job'], JobRun[]>>): NightlyRunsLoaded {
  return { available: true, jobs: NIGHTLY_JOBS.map((j) => ({ ...j, runs: runs[j.id] ?? [] })) }
}

const row = (name: string) => screen.getAllByTestId('nightly-job').find((r) => within(r).queryByText(name))!

afterEach(cleanup)

describe('Nightly runs on the Watches tab', () => {
  it('a row per nightly job, each saying how it works', () => {
    render(<NightlyRuns runs={loaded({})} now={NOW} />)
    expect(screen.getAllByTestId('nightly-job')).toHaveLength(4)
    expect(within(row('Walks')).getByText(/Works out walking times along the streets/)).toBeTruthy()
    expect(within(row('Walks')).getByText('Not run yet')).toBeTruthy()
  })

  it('what the last run did, and when', () => {
    render(<NightlyRuns runs={loaded({ watches: [run({})] })} now={NOW} />)
    expect(within(row('Watches')).getByText('Worked')).toBeTruthy()
    expect(within(row('Watches')).getByText(/Checked 107 of 107 watches/)).toBeTruthy()
  })

  // Oct 24's run, as it would have shown: started, never finished.
  it('a run that never finished shows as cut off, without opening anything', () => {
    render(<NightlyRuns runs={loaded({ watches: [run({ finishedAt: null, ok: null, summary: null })] })} now={NOW} />)
    expect(within(row('Watches')).getByText('Cut off')).toBeTruthy()
    expect(within(row('Watches')).getByText(/stopped before it finished/)).toBeTruthy()
  })

  it('a failed run shows its error', () => {
    render(<NightlyRuns runs={loaded({ 'sync-hours': [run({ job: 'sync-hours', ok: false, error: 'Google answered 403' })] })} now={NOW} />)
    expect(within(row('Google hours')).getByText('Failed')).toBeTruthy()
    expect(within(row('Google hours')).getByText(/Google answered 403/)).toBeTruthy()
  })

  it('a run that ran out of time says what it left', () => {
    render(<NightlyRuns runs={loaded({ watches: [run({ summary: 'Checked 80 of 107 watches', warning: 'Ran out of time: 27 left for the next night' })] })} now={NOW} />)
    expect(within(row('Watches')).getByText('Needs a look')).toBeTruthy()
    expect(within(row('Watches')).getByText('Ran out of time: 27 left for the next night')).toBeTruthy()
  })

  it('a job with no run since the night before last didn’t run', () => {
    render(<NightlyRuns runs={loaded({ 'walk-routes': [run({ job: 'walk-routes', startedAt: ago(54), finishedAt: ago(53.9) })] })} now={NOW} />)
    expect(within(row('Walks')).getByText('Didn’t run')).toBeTruthy()
    expect(within(row('Walks')).getByText(/Hasn’t run since/)).toBeTruthy()
  })

  it('opening a row shows its last runs', async () => {
    const runs = [run({ startedAt: ago(6) }), run({ startedAt: ago(30), finishedAt: null, ok: null, summary: null })]
    render(<NightlyRuns runs={loaded({ watches: runs })} now={NOW} />)
    await userEvent.setup().click(within(row('Watches')).getByRole('button'))
    const list = screen.getByRole('list', { name: 'Watches: last runs' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('Checked 107 of 107 watches'), expect.stringContaining('Didn’t finish')])
  })

  it('says when migration 086 hasn’t been run', () => {
    render(<NightlyRuns runs={{ available: false, jobs: [] }} now={NOW} />)
    expect(screen.getByText(/needs database migration 086/)).toBeTruthy()
  })
})
