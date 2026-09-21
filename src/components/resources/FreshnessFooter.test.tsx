// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FreshnessFooter from './FreshnessFooter'

afterEach(cleanup)

describe('FreshnessFooter — suggest a correction', () => {
  it('shows a "Suggest a correction" link beside the freshness line when given a handler', () => {
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-09-01T00:00:00.000Z" onSuggestCorrection={() => {}} />)
    expect(screen.getByRole('button', { name: 'Suggest a correction' })).toBeTruthy()
    expect(screen.getByText(/Confirmed/)).toBeTruthy()
  })

  it('shows it for a listing that has never been confirmed too', () => {
    render(<FreshnessFooter resourceId="r1" onSuggestCorrection={() => {}} />)
    expect(screen.getByRole('button', { name: 'Suggest a correction' })).toBeTruthy()
    expect(screen.getByText(/Is this info current/)).toBeTruthy()
  })

  it('shows nothing extra when editing is off for the listing', () => {
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-09-01T00:00:00.000Z" />)
    expect(screen.queryByRole('button', { name: 'Suggest a correction' })).toBeNull()
    expect(screen.getByText(/Confirmed/)).toBeTruthy()
  })

  it('calls the handler when clicked, without confirming the listing', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const onSuggest = vi.fn()
    render(<FreshnessFooter resourceId="r1" confirmedAt="2026-09-01T00:00:00.000Z" onSuggestCorrection={onSuggest} />)
    await userEvent.click(screen.getByRole('button', { name: 'Suggest a correction' }))
    expect(onSuggest).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
