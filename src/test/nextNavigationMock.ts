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
