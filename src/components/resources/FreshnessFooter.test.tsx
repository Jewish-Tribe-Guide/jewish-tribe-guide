// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import FreshnessFooter from './FreshnessFooter'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

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
})
