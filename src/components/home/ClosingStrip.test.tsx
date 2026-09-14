// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { community } from '@/community.config'
import ClosingStrip from './ClosingStrip'

describe('ClosingStrip', () => {
  it('uses community.region and the site name, not a hardcoded city/site name', () => {
    render(<ClosingStrip settings={{ name: 'Test Directory' }} />)

    expect(screen.getByText(`A more connected ${community.region}`)).toBeInTheDocument()
    expect(
      screen.getByText((_, el) => el?.tagName.toLowerCase() === 'p' && !!el.textContent?.includes('Test Directory')),
    ).toBeInTheDocument()
  })
})
