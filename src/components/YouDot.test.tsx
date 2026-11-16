// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import { mockRouter } from '@/test/nextNavigationMock'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

import { renderWithProviders } from '@/test/renderWithProviders'
import MobileTabBar from './MobileTabBar'
import { resetYouDotForTests } from '@/lib/useYouDot'
import { storeSeenAt } from '@/lib/youChanges'

// The blue dot on You (board PhoneYouDot, the user, Nov 15): a saved place
// changed since You was last opened. The phone's tab here; the header's
// link reads the same hook.

const tabs = [
  { id: 'categories', label: 'Home', target: 'categories' },
  { id: 'you', label: 'You', target: 'you' },
]

function serve(latest: Record<string, string>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, latest })))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  localStorage.clear()
  resetYouDotForTests()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const save = (...ids: string[]) => localStorage.setItem('jpc:pinned-listings', JSON.stringify(ids.map((id) => ({ id, categoryId: 'food' }))))
const you = () => screen.getByRole('button', { name: /You/ })

describe('the dot on You', () => {
  it('shows when a saved place changed after You was last opened', async () => {
    save('tj')
    localStorage.setItem('jpc:you-seen-at', String(Date.parse('2026-11-10T00:00:00Z')))
    serve({ tj: '2026-11-12T00:00:00Z' })
    renderWithProviders(<MobileTabBar mode="home" tabs={tabs} onSelect={vi.fn()} />)
    await waitFor(() => expect(you().querySelector('[data-testid="you-dot"]')).not.toBeNull())
  })

  it('goes out the moment You is opened', async () => {
    save('tj')
    localStorage.setItem('jpc:you-seen-at', String(Date.parse('2026-11-10T00:00:00Z')))
    serve({ tj: '2026-11-12T00:00:00Z' })
    renderWithProviders(<MobileTabBar mode="home" tabs={tabs} onSelect={vi.fn()} />)
    await waitFor(() => expect(you().querySelector('[data-testid="you-dot"]')).not.toBeNull())
    act(() => storeSeenAt(Date.parse('2026-11-13T00:00:00Z')))
    await waitFor(() => expect(you().querySelector('[data-testid="you-dot"]')).toBeNull())
  })

  it('none for a place that isn’t saved, one that changed before, or before You was ever opened', async () => {
    save('tj')
    localStorage.setItem('jpc:you-seen-at', String(Date.parse('2026-11-10T00:00:00Z')))
    const fetchMock = serve({ other: '2026-11-12T00:00:00Z', tj: '2026-11-01T00:00:00Z' })
    renderWithProviders(<MobileTabBar mode="home" tabs={tabs} onSelect={vi.fn()} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await act(async () => {})
    expect(you().querySelector('[data-testid="you-dot"]')).toBeNull()

    cleanup()
    resetYouDotForTests()
    localStorage.removeItem('jpc:you-seen-at')
    serve({ tj: '2026-11-12T00:00:00Z' })
    renderWithProviders(<MobileTabBar mode="home" tabs={tabs} onSelect={vi.fn()} />)
    await act(async () => {})
    expect(you().querySelector('[data-testid="you-dot"]')).toBeNull()
  })

  it('asks nothing when nothing is saved', async () => {
    const fetchMock = serve({})
    renderWithProviders(<MobileTabBar mode="home" tabs={tabs} onSelect={vi.fn()} />)
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
