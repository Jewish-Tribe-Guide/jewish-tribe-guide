// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { clearEruvStatuses } from '@/lib/useEruvStatuses'
import TrustBand, { clearListsRead } from './TrustBand'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

// Who keeps the guide right, at the top of the phone home (the user, Oct 17),
// and the sheet it opens, in front of the About page: the idea in three
// lines, each source named only once it has run this week.
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
let lists: { label: string | null; okAt: string | null }[] = []
let eruvChecked: (string | null)[] = []
const fetchMock = vi.fn(async (url: string) =>
  new Response(
    JSON.stringify(
      String(url).startsWith('/api/sources')
        ? { ok: true, lists }
        : { ok: true, available: true, timezone: 'America/New_York', candles: null, eruvim: eruvChecked.map((at, i) => ({ id: `e${i}`, name: `E${i}`, statusUrl: 'https://example.org/', statusCheckedAt: at })) },
    ),
  ),
)

beforeEach(() => {
  clearEruvStatuses()
  clearListsRead()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  lists = []
  eruvChecked = []
  cleanup()
  vi.unstubAllGlobals()
  fetchMock.mockClear()
})

const show = (facts: { places: number; googleChecked: number; checkedThisWeek: number | null; dated: number }) =>
  renderWithProviders(<TrustBand facts={facts} region="Philadelphia" communitySlug="philly" />)

const rows = async () => {
  const sheet = screen.getByRole('dialog', { name: 'How this guide stays right' })
  await waitFor(() => expect(within(sheet).queryByTestId('trust-sheet')?.querySelector('.animate-pulse')).toBeFalsy())
  return within(sheet)
    .getAllByRole('listitem')
    .map((li) => li.textContent)
}

describe('the trust line', () => {
  it('says who keeps it, how many places, and that Google checks the hours', () => {
    show({ places: 155, googleChecked: 135, checkedThisWeek: 129, dated: 132 })
    expect(screen.getByTestId('trust-band')).toHaveTextContent('Kept up by the community155 places · hours checked with Google every night')
    // Nothing fetched until it's opened.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens the idea in three lines: the sources it read this week, people for the rest, every listing dated', async () => {
    lists = [{ label: 'Keystone-K’s list', okAt: hoursAgo(6) }]
    eruvChecked = [hoursAgo(1), null]
    const user = userEvent.setup()
    show({ places: 155, googleChecked: 135, checkedThisWeek: 129, dated: 132 })
    await user.click(screen.getByTestId('trust-band'))
    expect(await rows()).toEqual([
      'Where there’s a source, we check itHours from Google, hechshers from Keystone-K’s list and eruv status from each eruv’s own site. Read again every day, and every 15 minutes on Friday for the eruv.',
      'People in Philadelphia fill in the restMinyan times, kosher items, Shabbos details. A person reviews every change before it shows.',
      // 23 places say "Not confirmed by anyone yet": the "if".
      'Every listing says if and when it was checkedSomething wrong? Open the place and tap Suggest an edit.',
    ])
    expect(screen.getByRole('link', { name: 'About the guide' })).toHaveAttribute('href', '/philly/about')
  })

  // The user, Oct 17: once every place has a date, the band says so, and
  // the sheet drops its "if".
  it('every place dated: the band says “every listing dated”, the sheet “when it was last checked”', async () => {
    const user = userEvent.setup()
    show({ places: 155, googleChecked: 135, checkedThisWeek: 129, dated: 155 })
    expect(screen.getByTestId('trust-band')).toHaveTextContent('Kept up by the community155 places · every listing dated')
    await user.click(screen.getByTestId('trust-band'))
    expect((await rows()).at(-1)).toBe('Every listing says when it was last checkedSomething wrong? Open the place and tap Suggest an edit.')
  })

  // As on the live site today: a Keystone K watch set up and never run,
  // and no eruv status read yet. Only Google is named.
  it('a check that’s set up but hasn’t run claims nothing', async () => {
    lists = [{ label: 'Keystone-K’s list', okAt: null }]
    eruvChecked = [null]
    const user = userEvent.setup()
    show({ places: 155, googleChecked: 135, checkedThisWeek: 129, dated: 132 })
    await user.click(screen.getByTestId('trust-band'))
    expect((await rows())[0]).toBe('Where there’s a source, we check itHours from Google. Read again every day.')
  })

  // A community that doesn't sync with Google and reads nothing else.
  it('no source at all: people keep everything, and nothing about Google', async () => {
    const user = userEvent.setup()
    show({ places: 3, googleChecked: 0, checkedThisWeek: 0, dated: 0 })
    expect(screen.getByTestId('trust-band')).toHaveTextContent(/3 places$/)
    await user.click(screen.getByTestId('trust-band'))
    const r = await rows()
    expect(r[0]).toBe('People in Philadelphia keep it upEverything here is added and fixed by people in the community. A person reviews every change before it shows.')
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Google')
  })

  it('the site’s own sheet: closes on Escape and on its ✕', async () => {
    const user = userEvent.setup()
    show({ places: 3, googleChecked: 0, checkedThisWeek: 0, dated: 0 })
    await user.click(screen.getByTestId('trust-band'))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByTestId('trust-band'))
    await user.click(await screen.findByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
