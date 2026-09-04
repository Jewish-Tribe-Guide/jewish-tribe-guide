// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import SubscribeSection from './SubscribeSection'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

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

describe('SubscribeSection', () => {
  it('defaults to a closed "All categories" picker', () => {
    renderWithProviders(<SubscribeSection />, { content: { categories: [grocery, synagogue] } })

    expect(screen.getByRole('button', { name: /All categories/ })).toBeInTheDocument()
    expect(screen.queryByText('Grocery Stores')).not.toBeInTheDocument()
  })

  it('opening the picker shows every category, checking one switches the button label to a count', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SubscribeSection />, { content: { categories: [grocery, synagogue] } })

    await user.click(screen.getByRole('button', { name: /All categories/ }))
    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    expect(screen.getByText('Synagogues')).toBeInTheDocument()

    await user.click(screen.getByText('Grocery Stores'))
    expect(screen.getByRole('button', { name: /1 checked/ })).toBeInTheDocument()
  })

  // The picker used to have no independent "closed" state — the only way
  // to collapse the list was re-checking "All categories", which threw
  // away whatever specific categories had just been picked. Closing it now
  // (Escape, or a click outside) must leave the selection intact.
  it('closing the picker (Escape) keeps the picked categories, not resetting to "All categories"', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SubscribeSection />, { content: { categories: [grocery, synagogue] } })

    await user.click(screen.getByRole('button', { name: /All categories/ }))
    await user.click(screen.getByText('Grocery Stores'))
    await user.keyboard('{Escape}')

    expect(screen.queryByText('Grocery Stores')).not.toBeInTheDocument() // panel closed
    expect(screen.getByRole('button', { name: /1 checked/ })).toBeInTheDocument() // selection survived
  })

  it('checking "All categories" inside the picker clears any specific picks', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SubscribeSection />, { content: { categories: [grocery, synagogue] } })

    await user.click(screen.getByRole('button', { name: /All categories/ }))
    await user.click(screen.getByText('Grocery Stores'))
    await user.click(screen.getByRole('checkbox', { name: 'All categories' }))

    expect(screen.getByRole('button', { name: /All categories/ })).toBeInTheDocument()
  })

  it('submits categories: null when "All categories" stays checked', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    renderWithProviders(<SubscribeSection />, { content: { categories: [grocery] } })

    await user.type(screen.getByLabelText('Email address'), 'person@example.com')
    await user.click(screen.getByRole('button', { name: 'Subscribe' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/subscribers?community=test-community')
    const body = JSON.parse(init.body)
    expect(body.email).toBe('person@example.com')
    expect(body.categories).toBeNull()
    expect(body.notifyAdd).toBe(true)
    expect(body.notifyClosure).toBe(true)

    expect(await screen.findByText(/You're subscribed/)).toBeInTheDocument()
  })

  it('submits only the picked categories once specific ones are chosen', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    renderWithProviders(<SubscribeSection />, { content: { categories: [grocery, synagogue] } })

    await user.type(screen.getByLabelText('Email address'), 'person@example.com')
    await user.click(screen.getByRole('button', { name: /All categories/ }))
    await user.click(screen.getByText('Grocery Stores'))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Subscribe' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.categories).toEqual(['grocery'])
  })

  it('refuses to submit when both New listings and Closures are unchecked', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch({ ok: true })
    renderWithProviders(<SubscribeSection />, { content: { categories: [grocery] } })

    await user.type(screen.getByLabelText('Email address'), 'person@example.com')
    await user.click(screen.getByRole('checkbox', { name: 'New listings' }))
    await user.click(screen.getByRole('checkbox', { name: 'Closures' }))
    await user.click(screen.getByRole('button', { name: 'Subscribe' }))

    expect(screen.getByText('Pick at least one thing to be notified about.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the server-provided error and stays on the form when the request fails', async () => {
    const user = userEvent.setup()
    stubFetch({ ok: false, errors: ['Something went wrong. Please try again.'] }, false)
    renderWithProviders(<SubscribeSection />, { content: { categories: [grocery] } })

    await user.type(screen.getByLabelText('Email address'), 'person@example.com')
    await user.click(screen.getByRole('button', { name: 'Subscribe' }))

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText(/You're subscribed/)).not.toBeInTheDocument()
  })
})
