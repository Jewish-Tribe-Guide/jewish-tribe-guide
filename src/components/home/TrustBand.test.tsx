// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { clearEruvStatuses } from '@/lib/useEruvStatuses'
import TrustBand from './TrustBand'
import type { CheckKind, TrustFacts } from '@/lib/phoneHome'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

// Who keeps the guide right, at the top of the phone home (the user, Oct 17),
// and the sheet it opens, in front of the About page: the idea in three
// lines, each check named only once it has run this week (Oct 23: all of
// them, and no source by name).
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
let eruvChecked: (string | null)[] = []
const fetchMock = vi.fn(async () =>
  new Response(
    JSON.stringify({ ok: true, available: true, timezone: 'America/New_York', candles: null, eruvim: eruvChecked.map((at, i) => ({ id: `e${i}`, name: `E${i}`, statusUrl: 'https://example.org/', statusCheckedAt: at })) }),
  ),
)

beforeEach(() => {
  clearEruvStatuses()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  eruvChecked = []
  cleanup()
  vi.unstubAllGlobals()
  fetchMock.mockClear()
})

const EVERY: CheckKind[] = ['times', 'mikvah', 'kosher', 'menus', 'hospitals']
const show = (facts: Omit<TrustFacts, 'checked'> & { checked?: CheckKind[] }) =>
  renderWithProviders(<TrustBand facts={{ checked: [], ...facts }} region="Philadelphia" communitySlug="philly" />)

const rows = async () => {
  const sheet = screen.getByRole('dialog', { name: 'How this guide stays right' })
  await waitFor(() => expect(within(sheet).queryByTestId('trust-sheet')?.querySelector('.animate-pulse')).toBeFalsy())
  return within(sheet)
    .getAllByRole('listitem')
    .map((li) => li.textContent)
}

describe('the trust line', () => {
  // The user, Oct 23: Google checks more than hours, and not every night.
  it('says who keeps it, how many places, and that they’re checked with Google', () => {
    show({ places: 155, googleChecked: 135, checkedThisWeek: 129, dated: 132 })
    expect(screen.getByTestId('trust-band')).toHaveTextContent('Kept up by the community155 places · checked with Google')
    // Nothing fetched while the home itself is loading.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // The user, Oct 20: the sheet showed a loading bar every time, since what
  // it says was only asked for on the tap. It's asked for once the home has
  // loaded, so the sheet opens whole.
  it('opened once the home has loaded, the sheet is whole at once: no loading bar', async () => {
    eruvChecked = [hoursAgo(1)]
    const user = userEvent.setup()
    show({ places: 155, googleChecked: 135, checkedThisWeek: 129, dated: 132, checked: ['kosher'] })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 4000 })
    await new Promise((r) => setTimeout(r, 0))
    await user.click(screen.getByTestId('trust-band'))
    const sheet = screen.getByTestId('trust-sheet')
    expect(sheet.querySelector('.animate-pulse')).toBeNull()
    expect(sheet).toHaveTextContent('Kosher certifications and eruv status.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // The user, Oct 23, word for word.
  it('opens the idea in three lines: everything checked this week, people for the rest, every listing dated', async () => {
    eruvChecked = [hoursAgo(1), null]
    const user = userEvent.setup()
    show({ places: 155, googleChecked: 135, checkedThisWeek: 129, dated: 132, checked: EVERY })
    await user.click(screen.getByTestId('trust-band'))
    expect(await rows()).toEqual([
      'We check it every dayMinyan times, mikvah hours, kosher certifications, menus, hospitals and eruv status. Places on Google Maps are checked against Google.',
      'People fill in the restNew places, kosher items at grocery stores, and Shabbos-friendly hotels. A person reviews every change before it shows.',
      'Every listing says when it was last checkedSomething wrong? Open the place and tap Edit listing.',
    ])
    expect(screen.getByRole('link', { name: 'About the guide' })).toHaveAttribute('href', '/philly/about')
  })

  it('every place dated: the band says “every listing dated”', () => {
    show({ places: 155, googleChecked: 135, checkedThisWeek: 129, dated: 155 })
    expect(screen.getByTestId('trust-band')).toHaveTextContent('Kept up by the community155 places · every listing dated')
  })

  // A check that's set up but hasn't dated anything this week, and no eruv
  // status read yet. Only Google is named.
  it('a check that hasn’t run this week claims nothing', async () => {
    eruvChecked = [null]
    const user = userEvent.setup()
    show({ places: 155, googleChecked: 135, checkedThisWeek: 129, dated: 132 })
    await user.click(screen.getByTestId('trust-band'))
    expect((await rows())[0]).toBe('We check it every dayPlaces on Google Maps are checked against Google.')
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
