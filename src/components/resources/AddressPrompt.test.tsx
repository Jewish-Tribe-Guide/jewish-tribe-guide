// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddressPrompt from './AddressPrompt'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe('AddressPrompt', () => {
  it.each(['inline', 'banner'] as const)('fires jpc:open-location when clicked (variant=%s)', async (variant) => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    document.addEventListener('jpc:open-location', onOpen)
    render(<AddressPrompt variant={variant} />)

    await user.click(screen.getByRole('button', { name: /Set location to see distances/ }))

    expect(onOpen).toHaveBeenCalledTimes(1)
    document.removeEventListener('jpc:open-location', onOpen)
  })

  it('defaults to the compact "inline" variant when no variant is passed', () => {
    render(<AddressPrompt />)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  // Regression coverage for the "banner" variant — mobile's own full-width
  // call to action at the top of the category page (GenericDirectory),
  // dismissible since it's a real banner competing for attention rather than
  // a small aside next to the title.
  it('"banner" variant is dismissible and disappears once dismissed', async () => {
    const user = userEvent.setup()
    render(<AddressPrompt variant="banner" />)

    expect(screen.getByRole('button', { name: /Set location to see distances/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('button', { name: /Set location to see distances/ })).toBeNull()
  })

  // "inline" is desktop's compact pill next to the title (DirectoryHeader) —
  // no dismiss, since it's a small aside there rather than a banner.
  it('"inline" variant has no dismiss control', () => {
    render(<AddressPrompt variant="inline" />)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })
})
