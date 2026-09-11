// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchSection from './SearchSection'

afterEach(() => cleanup())

// Desktop's search box moved out of HeroHeading into this own headed
// section — see HeroHeading's own doc for why. What matters here: heroTitle
// is this section's real heading (not a small label folded into someone
// else's card any more), and the box itself still drives the same query
// state Landing's grid filters on.
describe('SearchSection', () => {
  it('heads the section with heroTitle', () => {
    render(<SearchSection heroTitle="What are you looking for?" searchPlaceholder="Search…" query="" onQueryChange={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'What are you looking for?' })).toBeInTheDocument()
  })

  it('typing into the box calls onQueryChange, same as the box used to inside the hero', async () => {
    const user = userEvent.setup()
    const onQueryChange = vi.fn()
    render(<SearchSection heroTitle="What are you looking for?" searchPlaceholder="Search…" query="" onQueryChange={onQueryChange} />)

    await user.type(screen.getByLabelText('Search resources'), 'g')

    expect(onQueryChange).toHaveBeenCalledWith('g')
  })

  // Regression coverage for Landing's merged "Browse everything" card, which
  // already renders `heroTitle` as its OWN heading (with the section's usual
  // eyebrow above it) before mounting this section `bare` — without
  // `hideHeading`, that same string rendered a second time a few pixels
  // lower, the one place on the home screen with three stacked headings
  // instead of the eyebrow+title every other section uses.
  it('omits its own heading when hideHeading is set, without losing the box itself', () => {
    render(
      <SearchSection heroTitle="What are you looking for?" searchPlaceholder="Search…" query="" onQueryChange={vi.fn()} hideHeading />,
    )

    expect(screen.queryByRole('heading', { name: 'What are you looking for?' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search resources')).toBeInTheDocument()
  })
})
