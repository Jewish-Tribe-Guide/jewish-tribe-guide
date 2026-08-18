// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter, resetMockRouter } from '@/test/nextNavigationMock'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// useSiteNavigation only needs useCommunitySlug (community.slug) — no
// ContentProvider, no full renderWithProviders stack.
import { CommunityProvider } from '@/lib/communityContext'
import { makeCommunity } from '@/test/providerFixtures'
import { useSiteNavigation } from './useSiteNavigation'

// A thin harness exposing openFlow as a button click — useSiteNavigation is
// a hook, not a component, so this is the plain way to drive it under RTL.
function OpenFlowHarness({ from }: { from?: 'all' }) {
  const { openFlow } = useSiteNavigation()
  return <button onClick={() => openFlow('volunteer', undefined, from)}>Open</button>
}

function renderHarness(from?: 'all') {
  const community = makeCommunity({ slug: 'test-community' })
  render(
    <CommunityProvider community={community} communities={[community]}>
      <OpenFlowHarness from={from} />
    </CommunityProvider>,
  )
}

afterEach(() => {
  cleanup()
  resetMockRouter()
})

describe('useSiteNavigation — openFlow', () => {
  // Regression test: closing a form (SlugScreen) used to always go home,
  // even when opened from the All Categories index — see the `from` param
  // this test drives, which SlugScreen reads to send the visitor back to
  // where they actually came from.
  it('pushes a plain slug URL with no `from` param by default', async () => {
    const user = userEvent.setup()
    renderHarness()

    await user.click(screen.getByRole('button', { name: 'Open' }))

    expect(mockRouter.push).toHaveBeenCalledWith('/test-community/volunteer')
  })

  it('carries `from=all` in the query string when opened from the All Categories index', async () => {
    const user = userEvent.setup()
    renderHarness('all')

    await user.click(screen.getByRole('button', { name: 'Open' }))

    expect(mockRouter.push).toHaveBeenCalledWith('/test-community/volunteer?from=all')
  })
})
