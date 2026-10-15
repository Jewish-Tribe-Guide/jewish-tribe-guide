// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Eruv } from '@/lib/eruv'
import MapEruvDetail from './MapEruvDetail'

// EruvListing has its own tests; the stub stands in for its Edit listing
// opening and closing the editor, which it reports through onEditingChange.
vi.mock('@/components/resources/EruvListing', () => ({
  EruvListing: ({ onEditingChange }: { onEditingChange?: (editing: boolean) => void }) => (
    <div>
      <button onClick={() => onEditingChange?.(true)}>stub edit</button>
      <button onClick={() => onEditingChange?.(false)}>stub done</button>
    </div>
  ),
}))

afterEach(cleanup)

const eruv: Eruv = {
  id: 'center-city', name: 'Center City Eruv', covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: null, statusDated: false,
  status: 'up', statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null,
}
const renderDetail = (props: { onBack?: () => void; onEditingChange?: (editing: boolean) => void }) =>
  render(<MapEruvDetail eruv={eruv} color="#000" now={new Date()} timezone="America/New_York" candles={null} {...props} />)

describe('MapEruvDetail', () => {
  // Oct 15: the chevron alone, as for a place, not "‹ Back to list".
  it('goes back to the list with a chevron alone, named for screen readers', () => {
    const onBack = vi.fn()
    renderDetail({ onBack })
    const back = screen.getByRole('button', { name: 'Back to list' })
    expect(back).toHaveTextContent(/^$/)
    fireEvent.click(back)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  // While editing, the editor's ‹ is the way back; a second one above it
  // went to a different place (the list) from the one beside it (the eruv).
  it('drops its back while the eruv is being edited, and passes the editing on', () => {
    const onEditingChange = vi.fn()
    renderDetail({ onBack: vi.fn(), onEditingChange })
    fireEvent.click(screen.getByRole('button', { name: 'stub edit' }))
    expect(screen.queryByRole('button', { name: 'Back to list' })).not.toBeInTheDocument()
    expect(onEditingChange).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'stub done' }))
    expect(screen.getByRole('button', { name: 'Back to list' })).toBeInTheDocument()
    expect(onEditingChange).toHaveBeenLastCalledWith(false)
  })

  it('has no back of its own in the desktop sidebar', () => {
    renderDetail({})
    expect(screen.queryByRole('button', { name: /^Back/ })).not.toBeInTheDocument()
  })
})
