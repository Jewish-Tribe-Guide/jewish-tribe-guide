// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import DirectoryHeader from './DirectoryHeader'

afterEach(() => cleanup())

// Regression coverage for: once a location is set, this label is the ONLY
// content left in the row on mobile (titleInHeader hides the h1 above it —
// SiteHeader's own "‹ {title}" replaces it), sitting beside a real button
// (`actions`, e.g. Add: bordered, colored, padded). Rendered as plain muted
// text, it read as an afterthought next to that button, when it's actually
// what every listing's distance is sorted against.
describe('DirectoryHeader — the location label', () => {
  it('renders with real visual weight next to the Add button, not as an afterthought', () => {
    render(
      <DirectoryHeader
        title="Grocery"
        anchorLabel="Say She Ate"
        actions={<button>Add</button>}
        titleInHeader
      />,
    )

    const label = screen.getByText('Say She Ate')
    expect(label.className).toMatch(/font-medium/)
    expect(label.className).not.toMatch(/text-muted/)
  })
})
