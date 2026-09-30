// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import FreshnessFooter from './FreshnessFooter'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function mockFetch(...responses: unknown[]) {
  const spy = vi.spyOn(globalThis, 'fetch')
  for (const r of responses) spy.mockResolvedValueOnce(new Response(JSON.stringify(r)))
  return spy
}

describe('FreshnessFooter', () => {
  // Quiet while recent, asking once old (agreed Sep 30: 90 days).
  it('says when a listing was confirmed, and doesn’t ask while that’s recent', () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T12:00:00.000Z') })
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-08-20T12:00:00.000Z" />)
    expect(screen.getByTestId('freshness')).toHaveTextContent('Confirmed Aug 20.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('asks “Still right?” once the confirmation is 90 days old', () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T12:00:00.000Z') })
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-06-26T12:00:00.000Z" />)
    expect(screen.getByTestId('freshness')).toHaveTextContent('Confirmed Jun 26. Still right? Yes')
    expect(screen.getByRole('button', { name: 'Yes' })).toBeTruthy()
  })

  // What hardly changes (a hechsher, meat or dairy) is only dated, never
  // asked about, however old (agreed Sep 30).
  it('only says when it was last checked, however old, where it isn’t to be asked about', () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T12:00:00.000Z') })
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-03-01T12:00:00.000Z" subject="Kosher details" ask={false} />)
    expect(screen.getByTestId('freshness')).toHaveTextContent('Kosher details last checked Mar 1.')
    expect(screen.queryByRole('button')).toBeNull()
    cleanup()
    render(<FreshnessFooter resourceId="r1" subject="Kosher details" ask={false} />)
    expect(screen.getByTestId('freshness')).toHaveTextContent('Kosher details not checked by anyone yet.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('a day short of 90, still quiet', () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T12:00:00.000Z') })
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-06-27T12:00:00.000Z" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('with the year, once it’s most of a year ago', () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T12:00:00.000Z') })
    render(<FreshnessFooter resourceId="r1" confirmedAt="2025-08-01T12:00:00.000Z" />)
    expect(screen.getByTestId('freshness')).toHaveTextContent('Confirmed Aug 1, 2025.')
  })

  it('says so, and asks, for a listing nobody has confirmed yet', () => {
    render(<FreshnessFooter resourceId="r1" />)
    expect(screen.getByTestId('freshness')).toHaveTextContent('Not confirmed by anyone yet. Right? Yes')
  })

  it('names what’s confirmed where it isn’t the whole listing, and says Google’s part first', () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T12:00:00.000Z') })
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-09-20T12:00:00.000Z" subject="Times" lead="Website from Google, Sep 23" />)
    expect(screen.getByTestId('freshness')).toHaveTextContent('Website from Google, Sep 23. Times confirmed Sep 20.')
  })

  // The link that used to sit beside this line is gone on purpose — see the
  // component's doc. Asserted so it can't quietly come back as a second,
  // near-invisible door to the same form the "Suggest an edit" bar opens.
  it('offers no route into the edit form of its own', () => {
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-09-01T00:00:00.000Z" />)
    expect(screen.queryByRole('button', { name: /suggest/i })).toBeNull()
  })

  // Undo sends back what this browser was handed, so the server can refuse to
  // undo a confirmation someone else made since, and take this one back out
  // of the activity log.
  it('on undo, sends back its own stamp and log id along with the previous stamp', async () => {
    const spy = mockFetch(
      { ok: true, confirmedAt: '2026-09-25T15:00:00.000Z', changed: true, activityId: 42 },
      { ok: true, confirmedAt: '2026-05-01T00:00:00.000Z', changed: true },
    )
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-05-01T00:00:00.000Z" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
    expect(JSON.parse(spy.mock.calls[1][1]!.body as string)).toEqual({
      previousConfirmedAt: '2026-05-01T00:00:00.000Z',
      confirmedAt: '2026-09-25T15:00:00.000Z',
      activityId: 42,
    })
  })

  // Inside the server's cooldown nothing changed, so there's nothing of this
  // browser's to undo, and "Undo" would restore a stamp it never set.
  it('offers no Undo when the tap changed nothing (someone confirmed minutes ago)', async () => {
    mockFetch({ ok: true, confirmedAt: '2026-09-25T14:55:00.000Z', changed: false, activityId: null })
    render(<FreshnessFooter resourceId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(await screen.findByText(/Confirmed\. Thanks!/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
})
