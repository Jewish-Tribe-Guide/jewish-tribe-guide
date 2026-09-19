// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeListing } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import ReportSheet from './ReportSheet'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubFetch(body: Record<string, unknown>, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ReportSheet', () => {
  it('renders nothing when closed', () => {
    renderWithProviders(
      <ReportSheet isOpen={false} onClose={vi.fn()} listing={makeListing()} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the report form, embedded (no Back button of its own), when open', () => {
    renderWithProviders(
      <ReportSheet isOpen onClose={vi.fn()} listing={makeListing({ name: 'Kosher Mart' })} />,
    )
    expect(screen.getByRole('dialog', { name: /report a problem/i })).toBeInTheDocument()
    expect(screen.getByLabelText("What's the issue?")).toBeInTheDocument()
    expect(screen.getByText('Kosher Mart')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  // Draggable (this sheet always is, same as Add/Edit — see this
  // component's own doc), so it has no close button of its own: a backdrop
  // tap, Escape, or the drag-to-dismiss the whole header offers cover it.
  it('renders no close button', () => {
    renderWithProviders(
      <ReportSheet isOpen onClose={vi.fn()} listing={makeListing()} />,
    )

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('closes on a backdrop click, but not on a click inside the sheet', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <ReportSheet isOpen onClose={onClose} listing={makeListing()} />,
    )

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    // The backdrop is `role="presentation"`, the element the dialog itself
    // sits inside — clicking it directly (not a descendant) is what an
    // actual outside tap looks like.
    await user.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <ReportSheet isOpen onClose={onClose} listing={makeListing()} />,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('submits a real report for the listing passed in', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    const listing = makeListing({ id: 'listing-1', name: 'Kosher Mart' })
    renderWithProviders(
      <ReportSheet isOpen onClose={vi.fn()} listing={listing} />,
    )

    await user.type(screen.getByLabelText("What's the issue?"), 'Closed permanently.')
    await user.click(screen.getByRole('button', { name: 'Submit report' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.targetId).toBe('listing-1')
    expect(body.note).toBe('Closed permanently.')
  })
})
