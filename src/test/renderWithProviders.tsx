import type { ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import type { Community } from '@/lib/communityStore'
import type { CommunityContent } from '@/lib/loadCommunityContent'
import { CommunityProvider } from '@/lib/communityContext'
import { ContentProvider } from '@/lib/contentContext'
import { makeCommunity, makeContent } from './providerFixtures'

// ── Renders a component inside the same provider stack the real app wraps it
// in — CommunityProvider + ContentProvider (see communityContext.tsx /
// contentContext.tsx). This is what was blocking direct tests for
// GenericListingCard and the ~11 other components that read
// useCategories()/useCommunitySlug()/useActiveCommunity() (see the memory
// note this harness closes out).
//
// Deliberately does NOT mock next/navigation itself — useCommunitySlug pulls
// in useRouter() transitively, and vi.mock must be called at the top of the
// CONSUMING test file (hoisting), not from a helper it imports. Do this in
// your test file:
//
//   import { mockRouter } from '@/test/nextNavigationMock'
//   vi.mock('next/navigation', () => ({
//     useRouter: () => mockRouter,
//     usePathname: () => '/test-community',
//     useSearchParams: () => new URLSearchParams(),
//   }))
//
// before importing the component under test. ──

type Overrides = {
  content?: Partial<CommunityContent>
  community?: Partial<Community>
  communities?: Community[]
}

export function renderWithProviders(ui: ReactElement, options: Overrides & Omit<RenderOptions, 'wrapper'> = {}) {
  const { content, community, communities, ...renderOptions } = options
  const resolvedCommunity = makeCommunity(community)
  const resolvedContent = makeContent(content)
  const resolvedCommunities = communities ?? [resolvedCommunity]

  const wrap = (node: ReactElement) => (
    <CommunityProvider community={resolvedCommunity} communities={resolvedCommunities}>
      <ContentProvider content={resolvedContent}>{node}</ContentProvider>
    </CommunityProvider>
  )

  const view = render(wrap(ui), renderOptions)

  // RTL's own `rerender` replaces the whole tree with exactly what it's given,
  // which drops the providers and throws "Content hooks must be used inside a
  // ContentProvider". This re-wraps in the SAME resolved providers, so the
  // component under test keeps its identity — and therefore its state and
  // refs — across the rerender. That's what makes it possible to test how a
  // component reacts to a prop changing on an instance that isn't remounting,
  // which is the situation the App Router's segment cache creates.
  return { ...view, rerenderWithProviders: (node: ReactElement) => view.rerender(wrap(node)) }
}
