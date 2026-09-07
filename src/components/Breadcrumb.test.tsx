// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Breadcrumb from './Breadcrumb'

afterEach(() => cleanup())

// Desktop-only visibility (`hidden desktop:flex`) is a CSS media/container
// query jsdom doesn't compute — see UpButton's own sibling usage in every
// caller for how the mobile/desktop split is proven instead (real browser,
// e2e). What's testable here is the two-segment content and behavior itself.

describe('Breadcrumb', () => {
  it('renders both segments — the up label as a control, the title as plain text', () => {
    render(<Breadcrumb upLabel="Childcare" title="Add a Childcare" onUp={() => {}} />)

    expect(screen.getByRole('button', { name: 'Childcare' })).toBeInTheDocument()
    expect(screen.getByText('Add a Childcare')).toBeInTheDocument()
    // The current page's own name isn't a control — nothing to click to "go"
    // to where you already are.
    expect(screen.queryByRole('link', { name: 'Add a Childcare' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a Childcare' })).not.toBeInTheDocument()
  })

  it('calls onUp when the up segment is a click handler', async () => {
    const user = userEvent.setup()
    const onUp = vi.fn()
    render(<Breadcrumb upLabel="Childcare" title="Add a Childcare" onUp={onUp} />)

    await user.click(screen.getByRole('button', { name: 'Childcare' }))
    expect(onUp).toHaveBeenCalledTimes(1)
  })

  it('renders the up segment as a real link when given href instead of onUp', () => {
    render(<Breadcrumb upLabel="Home" title="About" href="/" />)

    const link = screen.getByRole('link', { name: 'Home' })
    expect(link).toHaveAttribute('href', '/')
    expect(screen.getByText('About')).toBeInTheDocument()
  })
})
