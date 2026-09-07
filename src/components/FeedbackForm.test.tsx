// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeedbackForm from './FeedbackForm'
import { submitRequest } from '@/lib/submitRequest'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'

vi.mock('@/lib/submitRequest', () => ({ submitRequest: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

describe('FeedbackForm — inline variant (the mobile Feedback tab)', () => {
  it('lets the visitor send a second message after the first succeeds', async () => {
    vi.mocked(submitRequest).mockResolvedValue({ ok: true, requestId: 'r1' })
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" variant="inline" />)

    await user.type(screen.getByLabelText('Your feedback'), 'First note')
    await user.click(screen.getByRole('button', { name: 'Send feedback' }))

    expect(await screen.findByText('Thanks for your note!')).toBeInTheDocument()
    // The bug this guards: the inline variant (no onClose to fall back on,
    // unlike the modal) used to leave the visitor stranded on the success
    // screen with no way back to a blank form for a second message.
    const again = screen.getByRole('button', { name: 'Send another message' })

    await user.click(again)

    const input = screen.getByLabelText('Your feedback') as HTMLTextAreaElement
    expect(input.value).toBe('')
    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeInTheDocument()
  })

  it('does not offer "Send another message" in the modal variant, which closes instead', async () => {
    vi.mocked(submitRequest).mockResolvedValue({ ok: true, requestId: 'r1' })
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Your feedback'), 'A note')
    await user.click(screen.getByRole('button', { name: 'Send feedback' }))

    expect(await screen.findByText('Thanks for your note!')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send another message' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  // The form (message + email + Turnstile + submit + privacy note) can be
  // taller than a short browser window can fit — centering a fixed-position
  // backdrop with no scroll of its own pushed the card's top out above the
  // viewport with nothing left to scroll it back into view. Fixed by making
  // the backdrop itself the scrollable element (not a vh-capped inner card,
  // tried first — see the component's own comment on why that's fragile on
  // a real device). jsdom doesn't compute real layout/overflow, so this
  // asserts on the class that fixes it rather than a measured position.
  it('scrolls the backdrop itself instead of overflowing the viewport', () => {
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" onClose={vi.fn()} />)

    const backdrop = screen.getByRole('heading', { name: 'Feedback' }).closest('.fixed.inset-0')
    expect(backdrop).toHaveClass('overflow-y-auto')
  })

  // Opened from HeaderNav's "More" menu, which lives inside SiteHeader — and
  // that header carries backdrop-blur, which (like a transform) establishes
  // a containing block for `position: fixed` descendants. Un-portaled, this
  // modal's `fixed inset-0` sized itself to the ~65px header instead of the
  // viewport: the backdrop dimmed only a strip at the top of the screen, and
  // the card rendered inside that strip, cut off, with the rest of the page
  // untouched below it — CommunitySwitcher hit the identical bug for the
  // identical reason (see its own doc). jsdom doesn't compute real
  // containing-block layout, so this can't assert on the visible clipping
  // itself — but it can assert on the fix: portaled straight to `document.
  // body`, this can never inherit a containing block from wherever in the
  // tree it's rendered, header or otherwise.
  it('portals to document.body, so a containing-block ancestor (e.g. the header\'s own backdrop-blur) can\'t clip it', () => {
    const { container } = renderWithProviders(
      <div style={{ transform: 'translateY(0)' }}>
        <FeedbackForm heading="Feedback" successMessage="Thanks!" onClose={vi.fn()} />
      </div>,
    )

    const backdrop = screen.getByRole('heading', { name: 'Feedback' }).closest('.fixed.inset-0')
    expect(backdrop?.parentElement).toBe(document.body)
    expect(container.contains(backdrop)).toBe(false)
  })
})
