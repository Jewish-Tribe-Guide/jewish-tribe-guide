// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import DirectoryHeader from './DirectoryHeader'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

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

// With no location set, the list's distances are from the community's
// centre, and the line under the title says so, with "Use my location"
// (DistanceNote). Desktop only here: phones get the same line at the top of
// the page (GenericDirectory).
describe('DirectoryHeader — no location set', () => {
  it('says where distances are from, gated to desktop', () => {
    const { container } = renderWithProviders(
      <DirectoryHeader title="Grocery" addressPrompt actions={<button>Add</button>} titleInHeader />,
    )

    expect(screen.getByText('Distances from central Test Region')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeInTheDocument()

    const column = container.querySelector('.mb-2')?.firstElementChild as HTMLElement
    const wrapper = column.lastElementChild as HTMLElement
    expect(wrapper.className).toMatch(/(?:^|\s)hidden(?:\s|$)/)
    expect(wrapper.className).toMatch(/desktop:flex/)
  })
})
