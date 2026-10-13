import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { CommunityProvider } from '@/lib/communityContext'
import { ContentProvider } from '@/lib/contentContext'
import { makeCommunity, makeContent } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import SiteChrome from './SiteChrome'

// The chrome is in the community layout, so it is prerendered for every route
// under it — including ones whose last segment isn't known at build time: a
// shared question nobody built ahead (/philly/ask/challah; only the box's own
// suggestions are in generateStaticParams), or a listing approved since the
// last build. There Next can't resolve the path while prerendering, so
// usePathname() suspends, and anything calling it outside a <Suspense> of its
// own blocks the route ("Next.js encountered URL data `usePathname()` in a
// Client Component outside of `<Suspense>`"). That is how the "+ Add" button
// shipped: the dev overlay caught it, nothing in the suites did, because every
// e2e route is one that was built ahead.
//
// This stands in for that prerender: usePathname never resolves, and the
// chrome must still render with the page inside it. A boundary around the
// whole chrome (or the page) would also pass this, which is why it asserts the
// header and the page content came out — the content must never be the thing
// that waits (see AGENTS.md, "The content is not server-rendered").

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  // A promise that never settles: what an unknown param looks like to a
  // client hook during prerendering.
  usePathname: () => {
    throw new Promise(() => {})
  },
  useSearchParams: () => new URLSearchParams(),
}))

describe('SiteChrome while the path is not known yet', () => {
  it('renders the header and the page, leaving only the path-reading pieces to stream in', () => {
    const community = makeCommunity()
    const html = renderToString(
      <CommunityProvider community={community} communities={[community]}>
        <ContentProvider content={makeContent()}>
          <SiteChrome year={2026}>
            <p>Page content</p>
          </SiteChrome>
        </ContentProvider>
      </CommunityProvider>,
    )

    expect(html).toContain('Page content')
    expect(html).toContain('<header')
  })
})
