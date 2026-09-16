// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileSheet from './MobileSheet'

afterEach(cleanup)

describe('MobileSheet', () => {
  it('renders nothing when closed', () => {
    render(
      <MobileSheet isOpen={false} onClose={vi.fn()} title="Suggest an edit">
        <p>form contents</p>
      </MobileSheet>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the title and children when open', () => {
    render(
      <MobileSheet isOpen onClose={vi.fn()} title="Suggest an edit">
        <p>form contents</p>
      </MobileSheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Suggest an edit' })).toBeInTheDocument()
    expect(screen.getByText('form contents')).toBeInTheDocument()
  })

  it('closes on the header close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MobileSheet isOpen onClose={onClose} title="Suggest an edit">
        <p>form contents</p>
      </MobileSheet>,
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a backdrop click, but not on a click inside the sheet', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MobileSheet isOpen onClose={onClose} title="Suggest an edit">
        <p>form contents</p>
      </MobileSheet>,
    )

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MobileSheet isOpen onClose={onClose} title="Suggest an edit">
        <p>form contents</p>
      </MobileSheet>,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
