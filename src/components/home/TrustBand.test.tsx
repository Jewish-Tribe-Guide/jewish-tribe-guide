// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import TrustBand from './TrustBand'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

// Who keeps the guide right, at the top of the phone home (the user, Oct 17),
// and the sheet it opens, in front of the About page.
afterEach(() => cleanup())

const show = (facts: { places: number; googleChecked: number; checkedThisWeek: number | null }) =>
  renderWithProviders(<TrustBand facts={facts} region="Philadelphia" communitySlug="philly" />)

describe('the trust line', () => {
  it('says who keeps it, how many places, and that Google checks the hours', () => {
    show({ places: 155, googleChecked: 135, checkedThisWeek: 129 })
    expect(screen.getByTestId('trust-band')).toHaveTextContent('Kept up by the community155 places · hours checked with Google every night')
  })

  it('opens a sheet: where the facts come from, how to check one place, and About behind it', async () => {
    const user = userEvent.setup()
    show({ places: 155, googleChecked: 135, checkedThisWeek: 129 })
    await user.click(screen.getByTestId('trust-band'))
    const sheet = within(screen.getByRole('dialog', { name: 'How this guide is kept up' }))
    expect(sheet.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Hours, address and phoneChecked against Google every night. 129 of 155 places checked this week.',
      'Everything elseHechsher, items, minyan times, Shabbos details: added and fixed by people in the Philadelphia community, and reviewed before it shows.',
      'Every listing says when it was last confirmedSee something wrong? Open the place and tap Suggest an edit.',
    ])
    expect(sheet.getByRole('link', { name: 'About the guide' })).toHaveAttribute('href', '/philly/about')
  })

  it('closes on Escape and on its ✕', async () => {
    const user = userEvent.setup()
    show({ places: 3, googleChecked: 0, checkedThisWeek: 0 })
    await user.click(screen.getByTestId('trust-band'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('trust-band'))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // A community that doesn't sync with Google: no claim about Google, and
  // the community's row is everything, not "everything else".
  it('without Google: no Google row, and the community keeps everything', async () => {
    const user = userEvent.setup()
    show({ places: 3, googleChecked: 0, checkedThisWeek: 0 })
    expect(screen.getByTestId('trust-band')).toHaveTextContent(/3 places$/)
    await user.click(screen.getByTestId('trust-band'))
    const rows = within(screen.getByRole('dialog')).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Everything in the guideAdded and fixed by people in the Philadelphia community')
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Google')
  })
})
