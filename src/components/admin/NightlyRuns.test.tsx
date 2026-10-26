// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { NightKindView } from '@/lib/nightKinds'
import NightlyRuns from './NightlyRuns'

function kind(over: Partial<NightKindView>): NightKindView {
  return { id: 'eruvs', name: 'Eruvs', about: 'Reads each eruv’s website for its hotline and email alerts.', when: '3:00 AM', count: '5 of 5 read', trouble: null, misses: [], tracked: [], nights: [], ...over }
}

const GOOGLE = kind({ id: 'google', name: 'Google', about: 'Reads every place matched on Google.', when: '2:00 AM', count: '140 places read', nights: [{ date: 'Oct 25', result: '140 read', tone: 'good' }, { date: 'Oct 24', result: 'Didn’t run', tone: 'bad' }] })
const ERUVS = kind({
  count: '1 of 5 read',
  trouble: '4 never read',
  misses: [{ name: 'Lower Merion Eruv', why: 'Never read', page: 'eruv' }, { name: 'A page', why: 'Didn’t load', page: '' }],
  nights: [{ date: 'Oct 25', result: '1 of 5 read', tone: 'bad' }],
})

const show = (kinds: NightKindView[], linkSender?: (id: string) => React.ReactNode) => render(<NightlyRuns runs={{ available: true, kinds }} base="/philly/admin" linkSender={linkSender} />)
const lastNight = () => screen.getByRole('region', { name: 'What’s tracked' })
const user = () => userEvent.setup()

afterEach(cleanup)

describe('What’s tracked on the Watches tab', () => {
  it('closed, says everything was read', () => {
    show([GOOGLE, kind({})])
    expect(lastNight()).toHaveTextContent('What’s trackedEverything read')
    expect(screen.queryAllByTestId('night-kind')).toHaveLength(0)
  })

  it('closed, says which kinds need a look', () => {
    show([GOOGLE, ERUVS, kind({ id: 'menus', name: 'Menus', count: 'Didn’t run since Oct 22' })])
    expect(lastNight()).toHaveTextContent('Eruvs and menus need a look')
  })

  it('opened, a line per kind with its time and what it read', async () => {
    show([GOOGLE, ERUVS])
    await user().click(within(lastNight()).getByRole('button', { name: /What’s tracked/ }))
    const rows = screen.getAllByTestId('night-kind')
    expect(rows.map((r) => r.textContent)).toEqual(['Google2:00 AM140 places read', 'Eruvs3:00 AM1 of 5 read · 4 never read'])
  })

  // FinalNightly's Eruvs, opened.
  it('a kind opens to what it reads, what wasn’t read, each a link, and its nights', async () => {
    show([GOOGLE, ERUVS])
    const u = user()
    await u.click(within(lastNight()).getByRole('button', { name: /What’s tracked/ }))
    await u.click(screen.getByRole('button', { name: /^Eruvs/ }))
    const row = screen.getAllByTestId('night-kind')[1]
    expect(within(row).getByText('Reads each eruv’s website for its hotline and email alerts.')).toBeTruthy()
    const misses = within(row).getByRole('list', { name: 'Eruvs: not read last night' })
    expect(within(misses).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Lower Merion EruvNever read', '/philly/admin/watches/eruv']])
    // A page with no job page of its own (added by hand) isn't a link.
    expect(within(misses).getAllByRole('listitem')[1]).toHaveTextContent('A pageDidn’t load')
    expect(within(row).getByRole('list', { name: 'Eruvs: last 14 nights' })).toHaveTextContent('Oct 251 of 5 read')
  })

  it('a kind with nothing missed says so', async () => {
    show([GOOGLE])
    const u = user()
    await u.click(within(lastNight()).getByRole('button', { name: /What’s tracked/ }))
    await u.click(screen.getByRole('button', { name: /^Google/ }))
    expect(screen.getByText('Nothing missed last night')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Google: last 14 nights' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Oct 25140 read', 'Oct 24Didn’t run'])
  })

  it('while loading, when it couldn’t load, and before migration 086', () => {
    const { rerender } = render(<NightlyRuns runs={undefined} base="/philly/admin" />)
    expect(lastNight()).toHaveTextContent('Loading…')
    rerender(<NightlyRuns runs={null} base="/philly/admin" />)
    expect(lastNight()).toHaveTextContent('Couldn’t load what’s tracked')
    rerender(<NightlyRuns runs={{ available: false, kinds: [] }} base="/philly/admin" />)
    expect(lastNight()).toHaveTextContent(/needs database migration 086/)
    expect(within(lastNight()).getByRole('button')).toBeDisabled()
  })

  // Oct 25 (the user): everything a kind tracks, not only what it missed.
  it('a kind opens to everything it tracks, what needs a look first', async () => {
    show([
      kind({
        tracked: [
          { name: 'Northeast Eruv', status: 'Not loading since Oct 22', bad: true, page: 'eruv' },
          { name: 'Center City Eruv', status: 'Read Oct 25', bad: false, page: 'eruv' },
          { name: 'A page', status: 'Read Oct 25', bad: false, page: '' },
        ],
      }),
    ])
    const u = user()
    await u.click(within(lastNight()).getByRole('button', { name: /What’s tracked/ }))
    await u.click(screen.getByRole('button', { name: /^Eruvs/ }))
    expect(screen.queryByRole('list', { name: 'Eruvs: all tracked' })).toBeNull()
    await u.click(screen.getByRole('button', { name: 'All 3 tracked' }))
    const all = screen.getByRole('list', { name: 'Eruvs: all tracked' })
    expect(within(all).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Northeast EruvNot loading since Oct 22', 'Center City EruvRead Oct 25', 'A pageRead Oct 25'])
    expect(within(all).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/philly/admin/watches/eruv', '/philly/admin/watches/eruv'])
    expect(within(all).getByText('Not loading since Oct 22')).toHaveClass('text-amber-800')
  })

  // Newsletters come as they're sent: what needs a look, not last night,
  // and a sender not linked to a shul gets its Link there.
  it('Newsletters: what needs a look, a sender to link linked in place', async () => {
    const news = kind({
      id: 'newsletters', name: 'Newsletters', when: null, count: '2 newsletters · last email Oct 25', trouble: '1 to link',
      misses: [{ name: 'info@lms.org', why: 'Not linked to a shul', page: '', link: 'w1' }],
      tracked: [{ name: 'info@lms.org', status: 'Not linked to a shul', bad: true, page: '' }, { name: 'BZBI', status: 'Email Oct 25', bad: false, page: 'times' }],
    })
    show([news], (id) => <span>Link box for {id}</span>)
    const u = user()
    await u.click(within(lastNight()).getByRole('button', { name: /What’s tracked/ }))
    expect(screen.getByTestId('night-kind')).toHaveTextContent('Newsletters2 newsletters · last email Oct 25 · 1 to link')
    await u.click(screen.getByRole('button', { name: /^Newsletters/ }))
    const needs = screen.getByRole('list', { name: 'Newsletters: needs a look' })
    expect(needs).toHaveTextContent('info@lms.orgNot linked to a shulLink box for w1')
    expect(screen.queryByText('Not read last night')).toBeNull()
  })
  // Links are checked once a week: what doesn't open needs a look, on its
  // place's kind page.
  it('Links: what doesn’t open needs a look, not last night', async () => {
    const links = kind({
      id: 'links', name: 'Links', when: 'Oct 25, 5:00 AM', count: '82 links', trouble: '1 doesn’t open', nights: [],
      misses: [{ name: 'House of Kosher · Kosher Certification URL', why: 'Not found since Oct 25', page: 'kind/restaurant' }],
      tracked: [{ name: 'House of Kosher · Kosher Certification URL', status: 'Not found since Oct 25', bad: true, page: 'kind/restaurant' }],
    })
    show([links])
    const u = user()
    await u.click(within(lastNight()).getByRole('button', { name: /What’s tracked/ }))
    await u.click(screen.getByRole('button', { name: /^Links/ }))
    const needs = screen.getByRole('list', { name: 'Links: needs a look' })
    expect(within(needs).getByRole('link')).toHaveAttribute('href', '/philly/admin/watches/kind/restaurant')
    expect(screen.queryByText('Not read last night')).toBeNull()
  })
})
