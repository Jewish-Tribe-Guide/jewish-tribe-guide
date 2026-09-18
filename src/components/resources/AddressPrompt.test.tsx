// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddressPrompt from './AddressPrompt'

afterEach(() => cleanup())

describe('AddressPrompt', () => {
  it('fires jpc:open-location when clicked, so the header popover opens without prop drilling', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    document.addEventListener('jpc:open-location', onOpen)
    render(<AddressPrompt />)

    await user.click(screen.getByRole('button', { name: /Set location to see distances/ }))

    expect(onOpen).toHaveBeenCalledTimes(1)
    document.removeEventListener('jpc:open-location', onOpen)
  })

  // Regression coverage for: on mobile, DirectoryHeader no longer shows a
  // resolved address at all (see that component's own doc) — this prompt is
  // now the only thing standing in for the whole subline while unset, so it
  // needs to fill the row rather than read as a small aside next to nothing.
  // Desktop is unchanged: compact and inline, same as it always was.
  it('goes full-width on mobile, compact/inline on desktop', () => {
    render(<AddressPrompt />)
    const button = screen.getByRole('button', { name: /Set location to see distances/ })

    expect(button.className).toMatch(/(?:^|\s)w-full(?:\s|$)/)
    expect(button.className).toMatch(/desktop:w-auto/)
    expect(button.className).toMatch(/desktop:inline-flex/)
  })
})
