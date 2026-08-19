import { useSyncExternalStore } from 'react'
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
// A plain module variable has no way to tell React it changed — fine as long
// as the component reading it also re-renders for some other reason on the
// same change (its own local state updating in the same click, say). That
// stopped being true once a param change and the component reading it live
// in different components — a wrapper whose only job is reading search
// params and handing them to a child as props (see FindResourcesConnected)
// — so this is a real pub/sub store now, and useMockSearchParams below
// subscribes to it, matching how useSearchParams() is genuinely reactive to
// router.push in real Next.js.
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function mockSearchParams(): URLSearchParams {
  return searchParams
}

export function setMockSearchParams(params: URLSearchParams | Record<string, string>): void {
  searchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params)
  notify()
}

/** A genuinely reactive useSearchParams() stand-in — use this (instead of
 *  `() => mockSearchParams()`) when the component under test doesn't
 *  independently re-render for another reason on the same param change.
 *  Wrapped in an arrow function at the call site, same as every other entry
 *  here — a bare reference trips up vi.mock's hoisting:
 *
 *    import { useMockSearchParams } from '@/test/nextNavigationMock'
 *    vi.mock('next/navigation', () => ({
 *      useRouter: () => ({ ...mockRouter, push: pushSyncingSearchParams }),
 *      usePathname: () => '/test-community',
 *      useSearchParams: () => useMockSearchParams(),
 *    })) */
export function useMockSearchParams(): URLSearchParams {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    mockSearchParams,
    mockSearchParams,
  )
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
