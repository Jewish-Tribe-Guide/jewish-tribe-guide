// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import type { Subscriber } from '@/lib/subscriberStore'
import SubscriberManager from './SubscriberManager'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/subscribers',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })

function makeSubscriber(overrides: Partial<Subscriber> = {}): Subscriber {
  return {
    id: '1',
    communityId: 'philly',
    email: 'person@example.com',
    categories: null,
    notifyAdd: true,
    notifyClosure: true,
    unsubscribeToken: 'tok',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function mockList(subscribers: Subscriber[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response))
  vi.mocked(parseOkJson).mockResolvedValue({ subscribers })
}

async function renderAndWaitForList(subscribers: Subscriber[] = []) {
  mockList(subscribers)
  renderWithProviders(<SubscriberManager token="tok" />, {
    community: { slug: 'philly' },
    content: { categories: [grocery] },
  })
  await screen.findByText(/Everyone who’s opted in/)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SubscriberManager', () => {
  it('shows a fallback message when nobody has subscribed yet', async () => {
    await renderAndWaitForList([])
    expect(screen.getByText('No one has subscribed yet.')).toBeInTheDocument()
  })

  it('lists each subscriber by email, resolves category ids to labels, and shows notify kinds', async () => {
    await renderAndWaitForList([
      makeSubscriber({ email: 'a@example.com', categories: ['grocery'], notifyAdd: true, notifyClosure: false }),
      makeSubscriber({ id: '2', email: 'b@example.com', categories: null }),
    ])

    expect(screen.getByText('a@example.com')).toBeInTheDocument()
    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    // a@example.com only has notifyAdd, not notifyClosure — matched by full
    // element text (a function matcher, not a fixed date string, since
    // toLocaleDateString() output depends on the runner's timezone) so it
    // doesn't collide with b@example.com's "... · Closures" row below.
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent?.startsWith('New listings — since') === true),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        (_, el) => el?.tagName === 'P' && el.textContent?.startsWith('New listings · Closures — since') === true,
      ),
    ).toBeInTheDocument()

    expect(screen.getByText('b@example.com')).toBeInTheDocument()
    expect(screen.getByText('All categories')).toBeInTheDocument()
  })

  it('shows the total count', async () => {
    await renderAndWaitForList([makeSubscriber({ id: '1' }), makeSubscriber({ id: '2', email: 'b@example.com' })])
    expect(screen.getByText('2 subscribers')).toBeInTheDocument()
  })

  it('scopes the GET to the active community', async () => {
    await renderAndWaitForList([])
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      '/api/admin/subscribers?community=philly',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    )
  })

  it('removing a subscriber asks for confirmation, DELETEs, and drops it from the list', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.mocked(fetchJson).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    await renderAndWaitForList([makeSubscriber({ email: 'gone@example.com' })])

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('gone@example.com'))
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/subscribers/1?community=philly',
      expect.objectContaining({ method: 'DELETE', headers: { Authorization: 'Bearer tok' } }),
      'Could not remove subscriber.',
    )
    await waitFor(() => expect(screen.queryByText('gone@example.com')).not.toBeInTheDocument())
  })

  it('leaves the subscriber alone when the confirmation is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const user = userEvent.setup()
    await renderAndWaitForList([makeSubscriber({ email: 'stays@example.com' })])

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(fetchJson).not.toHaveBeenCalled()
    expect(screen.getByText('stays@example.com')).toBeInTheDocument()
  })
})
