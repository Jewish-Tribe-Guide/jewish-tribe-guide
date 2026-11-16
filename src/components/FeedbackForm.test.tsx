// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
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

describe('FeedbackForm — modal variant semantics', () => {
  // Opened from the desktop footer and the header's More menu. It used
  // to be a bare fixed <div>: no role, no label, no Escape — a screen reader
  // had no idea it was a dialog and kept reading the page behind it.
  it('is a labelled, modal dialog', () => {
    renderWithProviders(<FeedbackForm heading="Send feedback" successMessage="Thanks!" onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: 'Send feedback' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Send feedback' })).toBeInTheDocument()
  })

  it('closes on Escape, like every other dialog here', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm heading="Send feedback" successMessage="Thanks!" onClose={onClose} />)

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not listen for Escape once it is unmounted', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { unmount } = renderWithProviders(<FeedbackForm heading="Send feedback" successMessage="Thanks!" onClose={onClose} />)
    unmount()

    await user.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
  })

  it('the inline variant is the form box alone: not a dialog, and no h1 (the page has it)', () => {
    renderWithProviders(<FeedbackForm heading="Send feedback" successMessage="Thanks!" variant="inline" />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'What’s on your mind?' })).toBeInTheDocument()
  })
})

describe('FeedbackForm — inline variant (the mobile /feedback page)', () => {
  it('lets the visitor send a second message after the first succeeds', async () => {
    vi.mocked(submitRequest).mockResolvedValue({ ok: true, requestId: 'r1' })
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" variant="inline" />)

    await user.type(screen.getByLabelText('Your note'), 'First note')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('heading', { name: 'Thanks, it’s sent' })).toBeInTheDocument()
    // The bug this guards: the inline variant (no onClose to fall back on,
    // unlike the modal) used to leave the visitor stranded on the success
    // screen with no way back to a blank form for a second message.
    const again = screen.getByRole('button', { name: 'Send another' })

    await user.click(again)

    const input = screen.getByLabelText('Your note') as HTMLTextAreaElement
    expect(input.value).toBe('')
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })

  it('does not offer "Send another message" in the modal variant, which closes instead', async () => {
    vi.mocked(submitRequest).mockResolvedValue({ ok: true, requestId: 'r1' })
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Your note'), 'A note')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('heading', { name: 'Thanks, it’s sent' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send another' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2) // the × and the thank-you's own
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

    const backdrop = screen.getByRole('dialog', { name: 'Feedback' }).closest('.fixed.inset-0')
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

    const backdrop = screen.getByRole('dialog', { name: 'Feedback' }).closest('.fixed.inset-0')
    expect(backdrop?.parentElement).toBe(document.body)
    expect(container.contains(backdrop)).toBe(false)
  })
})

// "Add it to the guide", from a search that found nothing, arrives with the
// question in the link: it's already written in.
describe('FeedbackForm — arriving from a search that found nothing', () => {
  it('starts with the question written in', async () => {
    window.history.replaceState(null, '', '/philly/feedback?about=frozen%20gefilte%20fish')
    renderWithProviders(<FeedbackForm heading="Send feedback" successMessage="Thanks!" onClose={vi.fn()} />)
    expect(await screen.findByDisplayValue('“frozen gefilte fish” isn’t in the guide. You can find it at:', { exact: false })).toBeInTheDocument()
    window.history.replaceState(null, '', '/')
  })

  it('starts empty otherwise', async () => {
    window.history.replaceState(null, '', '/philly/feedback')
    renderWithProviders(<FeedbackForm heading="Send feedback" successMessage="Thanks!" onClose={vi.fn()} />)
    expect(await screen.findByRole('textbox', { name: 'Your note' })).toHaveValue('')
    window.history.replaceState(null, '', '/')
  })
})

// Board Feedback (Nov 15): the form looked old and bland, and said
// "(optional, if you'd like a reply)" where a mark would do.
describe('FeedbackForm — the board’s form', () => {
  it('names its two fields plainly, with no “(optional …)” and no star', () => {
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" variant="inline" />)
    expect(screen.getByLabelText('Your note')).toHaveAttribute('placeholder', 'An idea, something that didn’t work, or what you’d like to see.')
    expect(screen.getByLabelText('Email, for a reply')).toHaveAttribute('type', 'email')
    expect(screen.queryByText(/optional/i)).not.toBeInTheDocument()
    expect(screen.queryByText('*')).not.toBeInTheDocument()
  })

  // 16px or more, or an iPhone zooms the page in when a field is tapped.
  it('draws its fields at 16px', () => {
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" variant="inline" />)
    for (const label of ['Your note', 'Email, for a reply']) expect(screen.getByLabelText(label)).toHaveClass('text-[16px]')
  })

  it('keeps Send pale until there is a note', async () => {
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" variant="inline" />)
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await user.type(screen.getByLabelText('Your note'), 'x')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  it('titles the form “Anything else?” on a phone when the Tell us card is above it', () => {
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" variant="inline" afterTellUs />)
    const title = screen.getByRole('heading', { level: 2 })
    expect(within(title).getByText('Anything else?')).toHaveClass('desktop:hidden')
    expect(within(title).getByText('What’s on your mind?')).toHaveClass('hidden', 'desktop:inline')
  })

  it('after sending: a check, the admin’s thank-you words, and the page told', async () => {
    vi.mocked(submitRequest).mockResolvedValue({ ok: true, requestId: 'r1' })
    const onSentChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="We read every note." variant="inline" onSentChange={onSentChange} />)
    await user.type(screen.getByLabelText('Your note'), 'A note')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('heading', { name: 'Thanks, it’s sent' })).toBeInTheDocument()
    expect(screen.getByText('We read every note.')).toBeInTheDocument()
    expect(onSentChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'Send another' }))
    expect(onSentChange).toHaveBeenLastCalledWith(false)
  })
})

describe('FeedbackForm — the dialog leads with Tell us', () => {
  it('shows “Know something we don’t?” before the form', () => {
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'Feedback' })
    const card = within(dialog).getByRole('button', { name: /Know something we don’t\?/ })
    const form = within(dialog).getByRole('region', { name: 'Anything else?' })
    expect(card.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // The box is fixed, and the dialog has a transform (its opening
  // animation), so the box has to leave the dialog: portaled to <body>, with
  // the dialog hidden while it's up and Escape left to the box.
  it('steps aside for the box, and leaves Escape to it', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm heading="Feedback" successMessage="Thanks!" onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /Know something we don’t\?/ }))
    expect(screen.getByRole('dialog', { hidden: true, name: 'Feedback' }).closest('.fixed.inset-0')).toHaveClass('hidden')
    await user.keyboard('{Escape}')
    // The box's own Escape may close it, which closes Feedback once; this
    // dialog's listener must not add a second.
    expect(onClose.mock.calls.length).toBeLessThanOrEqual(1)
  })
})

describe('FeedbackForm — the privacy line under the button', () => {
  it('is the one-liner, with a "Privacy" link that opens the policy in a new tab', () => {
    renderWithProviders(<FeedbackForm heading="Send feedback" successMessage="Thanks!" variant="inline" />)
    expect(screen.getByText(/Read by the people who run the guide\./)).toBeInTheDocument()
    expect(screen.queryByText(/never for marketing/)).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Privacy' })
    expect(link).toHaveAttribute('href', '/test-community/privacy')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
