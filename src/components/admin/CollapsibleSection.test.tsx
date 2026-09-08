// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollapsibleSection from './CollapsibleSection'

afterEach(() => cleanup())

describe('CollapsibleSection', () => {
  it('starts collapsed by default, and Show reveals the content', async () => {
    const user = userEvent.setup()
    render(
      <CollapsibleSection title="Widgets" description="A description">
        <p>Widget content</p>
      </CollapsibleSection>,
    )

    expect(screen.getByText('Widgets')).toBeInTheDocument()
    expect(screen.getByText('A description')).toBeInTheDocument()
    expect(screen.queryByText('Widget content')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show Widgets' }))
    expect(screen.getByText('Widget content')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide Widgets' }))
    expect(screen.queryByText('Widget content')).not.toBeInTheDocument()
  })

  it('starts open when defaultOpen is set', () => {
    render(
      <CollapsibleSection title="Widgets" defaultOpen>
        <p>Widget content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('Widget content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide Widgets' })).toBeInTheDocument()
  })

  it('shows a count next to the title when given one', () => {
    render(
      <CollapsibleSection title="Widgets" count={3}>
        <p>Widget content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('Widgets')).toBeInTheDocument()
    expect(screen.getByText('(3)')).toBeInTheDocument()
  })

  // Matches the original Sync Coverage behavior: an empty list still has
  // nothing to show even once opened.
  it('does not render children when opened with a count of exactly 0', async () => {
    const user = userEvent.setup()
    render(
      <CollapsibleSection title="Widgets" count={0}>
        <p>Widget content</p>
      </CollapsibleSection>,
    )
    await user.click(screen.getByRole('button', { name: 'Show Widgets' }))
    expect(screen.queryByText('Widget content')).not.toBeInTheDocument()
  })

  // The button's accessible name has to be predictable and distinct per
  // section — without an explicit aria-label it would be the button's
  // entire text content (title + description + "Show"), which is neither
  // stable nor useful for finding "the Show button" among several.
  it('gives the toggle button a stable, section-specific accessible name', () => {
    render(
      <CollapsibleSection title="Widgets" description="Some very long description text">
        <p>Widget content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByRole('button', { name: 'Show Widgets' })).toBeInTheDocument()
  })
})
