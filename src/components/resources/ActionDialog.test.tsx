// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActionDialog from './ActionDialog'

afterEach(() => cleanup())

describe('ActionDialog', () => {
  it('renders nothing when closed', () => {
    renderDialog(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the title and children when open', () => {
    renderDialog(true)
    expect(screen.getByRole('dialog', { name: 'Suggest an edit' })).toBeInTheDocument()
    expect(screen.getByText('form contents')).toBeInTheDocument()
  })

  // The "+ Add" box's steps (Oct 5): Back as the chevron before the title.
  it('shows Back before the title only when given one', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    const { rerender } = render(
      <ActionDialog isOpen onClose={() => {}} title="Find the place" onBack={onBack}>
        x
      </ActionDialog>,
    )
    const back = screen.getByRole('button', { name: 'Back' })
    expect(screen.getByRole('heading', { name: 'Find the place' }).parentElement).toContainElement(back)
    await user.click(back)
    expect(onBack).toHaveBeenCalledTimes(1)
    rerender(
      <ActionDialog isOpen onClose={() => {}} title="Find the place">
        x
      </ActionDialog>,
    )
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('closes on the header close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderDialog(true, onClose)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a backdrop click, but not on a click inside the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderDialog(true, onClose)

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderDialog(true, onClose)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

function renderDialog(isOpen: boolean, onClose = vi.fn()) {
  return render(
    <ActionDialog isOpen={isOpen} onClose={onClose} title="Suggest an edit">
      <p>form contents</p>
    </ActionDialog>,
  )
}
