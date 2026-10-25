// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { NightKindView } from '@/lib/nightKinds'
import NightlyRuns from './NightlyRuns'

function kind(over: Partial<NightKindView>): NightKindView {
  return { id: 'eruvs', name: 'Eruvs', about: 'Reads each eruv’s website for its hotline and email alerts.', when: '3:00 AM', count: '5 of 5 read', trouble: null, misses: [], nights: [], ...over }
}

const GOOGLE = kind({ id: 'google', name: 'Google', about: 'Reads every place matched on Google.', when: '2:00 AM', count: '140 places read', nights: [{ date: 'Oct 25', result: '140 read', tone: 'good' }, { date: 'Oct 24', result: 'Didn’t run', tone: 'bad' }] })
const ERUVS = kind({
  count: '1 of 5 read',
  trouble: '4 never read',
  misses: [{ name: 'Lower Merion Eruv', why: 'Never read', page: 'eruv' }, { name: 'A page', why: 'Didn’t load', page: '' }],
  nights: [{ date: 'Oct 25', result: '1 of 5 read', tone: 'bad' }],
})

const show = (kinds: NightKindView[]) => render(<NightlyRuns runs={{ available: true, kinds }} base="/philly/admin" />)
const lastNight = () => screen.getByRole('region', { name: 'Last night' })
const user = () => userEvent.setup()

afterEach(cleanup)

describe('Last night on the Watches tab', () => {
  it('closed, says everything was read', () => {
    show([GOOGLE, kind({})])
    expect(lastNight()).toHaveTextContent('Last nightEverything read')
    expect(screen.queryAllByTestId('night-kind')).toHaveLength(0)
  })

  it('closed, says which kinds weren’t all read', () => {
    show([GOOGLE, ERUVS, kind({ id: 'menus', name: 'Menus', count: 'Didn’t run since Oct 22' })])
    expect(lastNight()).toHaveTextContent('Eruvs and menus not all read')
  })

  it('opened, a line per kind with its time and what it read', async () => {
    show([GOOGLE, ERUVS])
    await user().click(within(lastNight()).getByRole('button', { name: /Last night/ }))
    const rows = screen.getAllByTestId('night-kind')
    expect(rows.map((r) => r.textContent)).toEqual(['Google2:00 AM140 places read', 'Eruvs3:00 AM1 of 5 read · 4 never read'])
  })

  // FinalNightly's Eruvs, opened.
  it('a kind opens to what it reads, what wasn’t read, each a link, and its nights', async () => {
    show([GOOGLE, ERUVS])
    const u = user()
    await u.click(within(lastNight()).getByRole('button', { name: /Last night/ }))
    await u.click(screen.getByRole('button', { name: /^Eruvs/ }))
    const row = screen.getAllByTestId('night-kind')[1]
    expect(within(row).getByText('Reads each eruv’s website for its hotline and email alerts.')).toBeTruthy()
    const misses = within(row).getByRole('list', { name: 'Eruvs: not read last night' })
    expect(within(misses).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Lower Merion EruvNever read', '/philly/admin/watches/eruv'],
      ['A pageDidn’t load', '/philly/admin/watches'],
    ])
    expect(within(row).getByRole('list', { name: 'Eruvs: last 14 nights' })).toHaveTextContent('Oct 251 of 5 read')
  })

  it('a kind with nothing missed says so', async () => {
    show([GOOGLE])
    const u = user()
    await u.click(within(lastNight()).getByRole('button', { name: /Last night/ }))
    await u.click(screen.getByRole('button', { name: /^Google/ }))
    expect(screen.getByText('Nothing missed last night')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Google: last 14 nights' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Oct 25140 read', 'Oct 24Didn’t run'])
  })

  it('while loading, when it couldn’t load, and before migration 086', () => {
    const { rerender } = render(<NightlyRuns runs={undefined} base="/philly/admin" />)
    expect(lastNight()).toHaveTextContent('Loading…')
    rerender(<NightlyRuns runs={null} base="/philly/admin" />)
    expect(lastNight()).toHaveTextContent('Couldn’t load the nightly runs')
    rerender(<NightlyRuns runs={{ available: false, kinds: [] }} base="/philly/admin" />)
    expect(lastNight()).toHaveTextContent(/needs database migration 086/)
    expect(within(lastNight()).getByRole('button')).toBeDisabled()
  })
})
