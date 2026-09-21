// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const contributions = vi.hoisted(() => ({ add: true, edit: true, report: true }))
vi.mock('@/lib/uiConfig', () => ({ ui: { contributions } }))
vi.mock('./ContributePicker', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Add a listing">
      <button onClick={onClose}>close picker</button>
    </div>
  ),
}))

const { default: CommunityStrip } = await import('./CommunityStrip')

beforeEach(() => {
  contributions.add = true
  contributions.edit = true
})
afterEach(cleanup)

describe('CommunityStrip', () => {
  it('says the guide is community-maintained and names both ways in', () => {
    render(<CommunityStrip />)
    expect(screen.getByText(/Community-maintained\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add a place' })).toBeTruthy()
    expect(screen.getByText(/suggest a correction/)).toBeTruthy()
  })

  it('opens the add picker from the link, and closes it again', async () => {
    const user = userEvent.setup()
    render(<CommunityStrip />)
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add a place' }))
    expect(screen.getByRole('dialog', { name: 'Add a listing' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'close picker' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not invite corrections when editing is off', () => {
    contributions.edit = false
    render(<CommunityStrip />)
    expect(screen.getByRole('button', { name: 'Add a place' })).toBeTruthy()
    expect(screen.queryByText(/suggest a correction/)).toBeNull()
  })

  it('does not offer adding when adding is off, but still invites corrections', () => {
    contributions.add = false
    render(<CommunityStrip />)
    expect(screen.queryByRole('button', { name: 'Add a place' })).toBeNull()
    expect(screen.getByText(/suggest a correction/)).toBeTruthy()
  })

  it('renders nothing when neither adding nor editing is on', () => {
    contributions.add = false
    contributions.edit = false
    const { container } = render(<CommunityStrip />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is inert in the admin preview (interactive off)', async () => {
    const user = userEvent.setup()
    render(<CommunityStrip interactive={false} />)
    const link = screen.getByRole('button', { name: 'Add a place' }) as HTMLButtonElement
    expect(link.disabled).toBe(true)
    await user.click(link)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
