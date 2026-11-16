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

describe('FeedbackForm — after sending', () => {
  it('lets the visitor send a second message after the first succeeds', async () => {
    vi.mocked(submitRequest).mockResolvedValue({ ok: true, requestId: 'r1' })
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm successMessage="Thanks!" />)

    await user.type(screen.getByLabelText('Your note'), 'First note')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('heading', { name: 'Thanks, it’s sent' })).toBeInTheDocument()
    // The bug this guards: the page used to leave the visitor stranded on
    // the success screen with no way back to a blank form for a second message.
    const again = screen.getByRole('button', { name: 'Send another' })

    await user.click(again)

    const input = screen.getByLabelText('Your note') as HTMLTextAreaElement
    expect(input.value).toBe('')
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })
})

// Feedback took "?about=" from a search that found nothing until Oct 10,
// when that link left the search. Where a place is missing, the + Add box
// is the way in (the user, Nov 16), so Feedback no longer writes it in.
describe('FeedbackForm — a stale "?about=" link', () => {
  it('starts empty all the same', async () => {
    window.history.replaceState(null, '', '/philly/feedback?about=frozen%20gefilte%20fish')
    renderWithProviders(<FeedbackForm successMessage="Thanks!" />)
    expect(await screen.findByRole('textbox', { name: 'Your note' })).toHaveValue('')
    window.history.replaceState(null, '', '/')
  })
})

// Board Feedback (Nov 15): the form looked old and bland, and said
// "(optional, if you'd like a reply)" where a mark would do.
describe('FeedbackForm — the board’s form', () => {
  it('names its two fields plainly, with no “(optional …)” and no star', () => {
    renderWithProviders(<FeedbackForm successMessage="Thanks!" />)
    expect(screen.getByLabelText('Your note')).toHaveAttribute('placeholder', 'An idea, something that didn’t work, or what you’d like to see.')
    expect(screen.getByLabelText('Email, for a reply')).toHaveAttribute('type', 'email')
    expect(screen.queryByText(/optional/i)).not.toBeInTheDocument()
    expect(screen.queryByText('*')).not.toBeInTheDocument()
  })

  // 16px or more, or an iPhone zooms the page in when a field is tapped.
  it('draws its fields at 16px', () => {
    renderWithProviders(<FeedbackForm successMessage="Thanks!" />)
    for (const label of ['Your note', 'Email, for a reply']) expect(screen.getByLabelText(label)).toHaveClass('text-[16px]')
  })

  it('keeps Send pale until there is a note', async () => {
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm successMessage="Thanks!" />)
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await user.type(screen.getByLabelText('Your note'), 'x')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  it('titles the form “Anything else?” on a phone when the Tell us card is above it', () => {
    renderWithProviders(<FeedbackForm successMessage="Thanks!" afterTellUs />)
    const title = screen.getByRole('heading', { level: 2 })
    expect(within(title).getByText('Anything else?')).toHaveClass('desktop:hidden')
    expect(within(title).getByText('What’s on your mind?')).toHaveClass('hidden', 'desktop:inline')
  })

  it('after sending: a check, the admin’s thank-you words, and the page told', async () => {
    vi.mocked(submitRequest).mockResolvedValue({ ok: true, requestId: 'r1' })
    const onSentChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<FeedbackForm successMessage="We read every note." onSentChange={onSentChange} />)
    await user.type(screen.getByLabelText('Your note'), 'A note')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('heading', { name: 'Thanks, it’s sent' })).toBeInTheDocument()
    expect(screen.getByText('We read every note.')).toBeInTheDocument()
    expect(onSentChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'Send another' }))
    expect(onSentChange).toHaveBeenLastCalledWith(false)
  })
})

describe('FeedbackForm — the privacy line under the button', () => {
  it('is the one-liner, with a "Privacy" link that opens the policy in a new tab', () => {
    renderWithProviders(<FeedbackForm successMessage="Thanks!" />)
    expect(screen.getByText(/Read by the people who run the guide\./)).toBeInTheDocument()
    expect(screen.queryByText(/never for marketing/)).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Privacy' })
    expect(link).toHaveAttribute('href', '/test-community/privacy')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
