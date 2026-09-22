// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import DirectoryHeader from './DirectoryHeader'

afterEach(() => cleanup())

// Regression coverage for: a resolved address used to repeat under the
// title on mobile too, sitting beside a real button (`actions`, e.g. Add:
// bordered, colored, padded) — a mismatch no amount of font styling on the
// text side actually fixed, since one side is a button and the other isn't.
// It's desktop-only now; on mobile the address stays reachable the normal
// way, one tap on the header's own location pin, without repeating here.
describe('DirectoryHeader — the resolved location label', () => {
  it('is desktop-only — hidden on mobile entirely, not just restyled', () => {
    render(
      <DirectoryHeader
        title="Grocery"
        anchorLabel="Say She Ate"
        actions={<button>Add</button>}
        titleInHeader
      />,
    )

    const label = screen.getByText('Say She Ate')
    expect(label.className).toMatch(/(?:^|\s)hidden(?:\s|$)/)
    expect(label.className).toMatch(/desktop:flex/)
  })

  // The label briefly carried a mobile-oriented weight bump (text-base,
  // font-medium, slate-600 instead of text-muted) from when it was still
  // rendered on mobile as the row's only content. That reasoning never
  // applied to desktop — which keeps its visible h1 and doesn't need this
  // line to carry extra visual weight next to it — so once the mobile
  // rendering was dropped entirely, the bump should have reverted with it
  // rather than staying stuck on desktop. It's back to plain text-sm
  // text-muted, the same as before that sequence of changes.
  it('stays plain, muted text on desktop — it sits beside a real h1, not as a stand-in for one', () => {
    render(
      <DirectoryHeader
        title="Grocery"
        anchorLabel="Say She Ate"
        actions={<button>Add</button>}
        titleInHeader
      />,
    )

    const label = screen.getByText('Say She Ate')
    expect(label.className).toMatch(/text-sm/)
    expect(label.className).toMatch(/text-muted/)
    expect(label.className).not.toMatch(/text-base/)
    expect(label.className).not.toMatch(/font-medium/)
  })
})

// Regression coverage for: the UNSET "Set location" prompt (AddressPrompt)
// used to keep a mobile presence here (a real call to action, so it grew to
// fill the row rather than shrinking away) — it's desktop-only now, since
// mobile's own copy moved to a bigger, dismissible `banner` variant at the
// top of the page (GenericDirectory). This instance renders the compact
// `inline` variant, wrapped in `hidden desktop:*` same as the resolved
// address/count branches above it.
describe('DirectoryHeader — the unset location prompt', () => {
  it('renders the compact "inline" variant, gated to desktop', () => {
    const { container } = render(
      <DirectoryHeader title="Grocery" addressPrompt actions={<button>Add</button>} titleInHeader />,
    )

    const prompt = screen.getByRole('button', { name: /Set location to see distances/ })
    expect(prompt).toBeInTheDocument()

    const column = container.querySelector('.mb-2')?.firstElementChild as HTMLElement
    const promptWrapper = column.lastElementChild as HTMLElement
    expect(promptWrapper.className).toMatch(/(?:^|\s)hidden(?:\s|$)/)
    expect(promptWrapper.className).toMatch(/desktop:flex/)
  })
})
