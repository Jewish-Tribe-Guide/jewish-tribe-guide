// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import OfflinePage from './page'

// Nov 18, review item 36: the offline page had no way out, so an installed
// app opened with no signal was stuck on it.
describe('the offline page', () => {
  it('links to the home page', () => {
    render(<OfflinePage />)
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/')
  })
})
