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

// Regression coverage for: unlike the resolved address above, the UNSET
// "Set location" prompt (AddressPrompt) is a real call to action — nothing
// on the page works right until someone answers it — so it keeps its
// mobile presence rather than going desktop-only, and needs room to
// actually stretch across the row (see AddressPrompt's own doc on why it's
// `w-full` there). The column wrapping it has to stretch too, or the
// button's own `w-full` has nothing real to fill.
describe('DirectoryHeader — the unset location prompt', () => {
  it('gives the prompt column room to go full-width on mobile', () => {
    const { container } = render(
      <DirectoryHeader title="Grocery" addressPrompt actions={<button>Add</button>} titleInHeader />,
    )

    const prompt = screen.getByRole('button', { name: /Set location to see distances/ })
    const column = container.querySelector('.mb-2')?.firstElementChild as HTMLElement
    expect(column.className).toMatch(/(?:^|\s)w-full(?:\s|$)/)
    expect(prompt).toBeInTheDocument()
  })
})
