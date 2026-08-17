// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LiveLocationPrompt from './LiveLocationPrompt'

// The re-ask timing and the "don't re-show after an interaction this
// session" guard are the whole point of this component — a bug in either one
// means either nagging a visitor every visit, or a real opt-in silently
// popping back open when a background auto-resume flips `enabled`.

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe('LiveLocationPrompt', () => {
  it('renders nothing when disabled', () => {
    render(<LiveLocationPrompt enabled={false} onShare={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the prompt on first visit when enabled', () => {
    render(<LiveLocationPrompt enabled={true} onShare={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: /share your live location/i })).toBeInTheDocument()
  })

  it('calls onShare and hides itself when "Share my location" is clicked', async () => {
    const onShare = vi.fn()
    const user = userEvent.setup()
    render(<LiveLocationPrompt enabled={true} onShare={onShare} />)

    await user.click(screen.getByRole('button', { name: /share my location/i }))

    expect(onShare).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clears any stored dismissal when sharing, so a future opt-out starts fresh', async () => {
    // Old enough to be past the re-ask window, so the prompt actually renders
    // (see "re-shows once the re-ask window has passed" below) — this test
    // only cares about what sharing does to that storage afterward.
    const staleDismissal = Date.now() - 3 * 24 * 60 * 60 * 1000 - 1
    localStorage.setItem('jpc:live-location-prompt', String(staleDismissal))
    const user = userEvent.setup()
    render(<LiveLocationPrompt enabled={true} onShare={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /share my location/i }))

    expect(localStorage.getItem('jpc:live-location-prompt')).toBeNull()
  })

  it('hides without calling onShare when "Not now" is clicked, and remembers the dismissal', async () => {
    const onShare = vi.fn()
    const user = userEvent.setup()
    render(<LiveLocationPrompt enabled={true} onShare={onShare} />)

    await user.click(screen.getByRole('button', { name: /not now/i }))

    expect(onShare).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem('jpc:live-location-prompt')).toBeTruthy()
  })

  it('dismisses when the backdrop (not the dialog itself) is clicked', async () => {
    const user = userEvent.setup()
    render(<LiveLocationPrompt enabled={true} onShare={vi.fn()} />)

    await user.click(screen.getByRole('presentation'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not dismiss when clicking inside the dialog itself', async () => {
    const user = userEvent.setup()
    render(<LiveLocationPrompt enabled={true} onShare={vi.fn()} />)

    await user.click(screen.getByRole('dialog'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not re-show on a fresh mount soon after a "Not now"', () => {
    localStorage.setItem('jpc:live-location-prompt', String(Date.now()))
    render(<LiveLocationPrompt enabled={true} onShare={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('re-shows once the re-ask window (3 days) has passed', () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000 - 1
    localStorage.setItem('jpc:live-location-prompt', String(threeDaysAgo))
    render(<LiveLocationPrompt enabled={true} onShare={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not pop back open if `enabled` flips true again after this session\'s own interaction', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<LiveLocationPrompt enabled={true} onShare={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /not now/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Simulates the enabled=false-then-true flicker described in the
    // component's own comment (a pending silent auto-resume resolving).
    rerender(<LiveLocationPrompt enabled={false} onShare={vi.fn()} />)
    rerender(<LiveLocationPrompt enabled={true} onShare={vi.fn()} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
