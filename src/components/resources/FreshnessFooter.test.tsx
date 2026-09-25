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
  it('says how long ago a listing was confirmed, and offers to confirm it again', () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T12:00:00.000Z') })
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-09-21T12:00:00.000Z" />)
    expect(screen.getByText(/Confirmed 3 days ago/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Still right?' })).toBeTruthy()
  })

  it('asks instead, for a listing nobody has confirmed yet', () => {
    render(<FreshnessFooter resourceId="r1" />)
    expect(screen.getByText(/Is this info current\?/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mark as current' })).toBeTruthy()
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
      { ok: true, confirmedAt: '2026-09-01T00:00:00.000Z', changed: true },
    )
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-09-01T00:00:00.000Z" />)
    fireEvent.click(screen.getByRole('button', { name: 'Still right?' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
    expect(JSON.parse(spy.mock.calls[1][1]!.body as string)).toEqual({
      previousConfirmedAt: '2026-09-01T00:00:00.000Z',
      confirmedAt: '2026-09-25T15:00:00.000Z',
      activityId: 42,
    })
  })

  // Inside the server's cooldown nothing changed, so there's nothing of this
  // browser's to undo, and "Undo" would restore a stamp it never set.
  it('offers no Undo when the tap changed nothing (someone confirmed minutes ago)', async () => {
    mockFetch({ ok: true, confirmedAt: '2026-09-25T14:55:00.000Z', changed: false, activityId: null })
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-09-25T14:55:00.000Z" />)
    fireEvent.click(screen.getByRole('button', { name: 'Still right?' }))
    expect(await screen.findByText(/Confirmed — thanks!/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
})
