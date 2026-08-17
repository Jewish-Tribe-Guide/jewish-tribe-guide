import { vi } from 'vitest'

// ── A shared next/navigation router mock.
//
// Import `mockRouter` (not a local `const`) into your test file's own
// `vi.mock('next/navigation', ...)` call — vi.mock factories are hoisted
// above the rest of the file and can only close over an imported binding,
// not a variable declared later in the same file. Usage:
//
//   import { mockRouter } from '@/test/nextNavigationMock'
//   vi.mock('next/navigation', () => ({
//     useRouter: () => mockRouter,
//     usePathname: () => '/test-community',
//     useSearchParams: () => new URLSearchParams(),
//   }))
//
// Needed by anything that calls useCommunitySlug()/useActiveCommunity()
// (communityContext.tsx) — that hook calls next/navigation's useRouter()
// unconditionally, even for callers that never trigger setCommunity. ──

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}

export function resetMockRouter(): void {
  for (const fn of Object.values(mockRouter)) fn.mockClear()
}

// A settable `useSearchParams()` stand-in, for components that read the
// query string directly (not just through useCommunitySlug). A plain
// exported `let` can't be reassigned from inside a vi.mock factory in the
// consuming file (same hoisting restriction as mockRouter above), so this
// goes through get/set functions instead — call `setMockSearchParams(...)`
// in each test before rendering:
//
//   import { mockSearchParams, setMockSearchParams } from '@/test/nextNavigationMock'
//   vi.mock('next/navigation', () => ({
//     useRouter: () => mockRouter,
//     usePathname: () => '/test-community',
//     useSearchParams: () => mockSearchParams(),
//   }))
//   ...
//   setMockSearchParams({ form: 'create' })
let searchParams = new URLSearchParams()

export function mockSearchParams(): URLSearchParams {
  return searchParams
}

export function setMockSearchParams(params: URLSearchParams | Record<string, string>): void {
  searchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params)
}

// A `router.push` that also updates mockSearchParams from the pushed URL's
// query string — real Next.js router.push updates useSearchParams() for the
// very next render, and a component that derives what to show from
// `params.get(...)` (not just its own local state — see FindResources'
// `action`) needs that kept in sync to behave correctly under test. The
// plain mockRouter.push is a no-op vi.fn(); use this instead when a
// component's push→searchParams round trip actually matters:
//
//   import { mockRouter, mockSearchParams, pushSyncingSearchParams } from '@/test/nextNavigationMock'
//   vi.mock('next/navigation', () => ({
//     useRouter: () => ({ ...mockRouter, push: pushSyncingSearchParams }),
//     usePathname: () => '/test-community',
//     useSearchParams: () => mockSearchParams(),
//   }))
//
// Assertions against mockRouter.push still work — it's still called with the
// same arguments, just alongside the extra behavior.
export function pushSyncingSearchParams(url: string): void {
  mockRouter.push(url)
  const qIndex = url.indexOf('?')
  setMockSearchParams(qIndex === -1 ? {} : new URLSearchParams(url.slice(qIndex + 1)))
}
