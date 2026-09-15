// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClosingStrip from './ClosingStrip'

describe('ClosingStrip', () => {
  it('shows the admin-editable site name and mission, matching SiteFooter\'s own left column', () => {
    render(<ClosingStrip settings={{ name: 'Test Directory', mission: 'A test mission statement.' }} />)

    expect(screen.getByText('Test Directory')).toBeInTheDocument()
    expect(screen.getByText('A test mission statement.')).toBeInTheDocument()
  })
})
