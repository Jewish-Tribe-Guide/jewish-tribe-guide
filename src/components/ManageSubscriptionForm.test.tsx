// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeCategory } from '@/test/providerFixtures'
import type { Subscriber } from '@/lib/subscriberStore'
import ManageSubscriptionForm from './ManageSubscriptionForm'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubFetch(body: Record<string, unknown>, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })

function makeSubscriber(overrides: Partial<Subscriber> = {}): Subscriber {
  return {
    id: '1',
    communityId: 'philly',
    email: 'person@example.com',
    categories: null,
    notifyAdd: true,
    notifyClosure: true,
    unsubscribeToken: 'tok123',
    ...overrides,
  }
}

// The one place a subscriber can actually narrow their subscription — see
// this component's own doc on why it's a real replace, unlike the public
// signup form's merge-only behavior.
describe('ManageSubscriptionForm', () => {
  it('prefills from the subscriber\'s current preferences', () => {
    render(
      <ManageSubscriptionForm
        token="tok123"
        subscriber={makeSubscriber({ categories: ['grocery'], notifyAdd: true, notifyClosure: false })}
        categories={[grocery, synagogue]}
      />,
    )

    expect(screen.getByRole('checkbox', { name: 'All categories' })).not.toBeChecked()
    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'New listings' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Closures' })).not.toBeChecked()
  })

  it('saves a real replace, not a merge — unchecking a previously-selected category removes it', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    render(
      <ManageSubscriptionForm
        token="tok123"
        subscriber={makeSubscriber({ categories: ['grocery', 'synagogue'] })}
        categories={[grocery, synagogue]}
      />,
    )

    await user.click(screen.getByText('Grocery Stores'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/subscribers/manage')
    const body = JSON.parse(init.body)
    expect(body.token).toBe('tok123')
    expect(body.categories).toEqual(['synagogue'])

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('refuses to save when both notify kinds are unchecked', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    render(<ManageSubscriptionForm token="tok123" subscriber={makeSubscriber()} categories={[grocery]} />)

    await user.click(screen.getByRole('checkbox', { name: 'New listings' }))
    await user.click(screen.getByRole('checkbox', { name: 'Closures' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Pick at least one thing to be notified about.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('links "Unsubscribe from everything" to the unsubscribe route with the same token', () => {
    render(<ManageSubscriptionForm token="tok123" subscriber={makeSubscriber()} categories={[grocery]} />)

    const link = screen.getByRole('link', { name: 'Unsubscribe from everything' })
    expect(link).toHaveAttribute('href', '/api/subscribers/unsubscribe?token=tok123')
  })
})
