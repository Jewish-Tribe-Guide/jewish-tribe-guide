// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { DirectoryResource } from '@/types'
import { mockRouter } from '@/test/nextNavigationMock'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// The bot check is configured here, as it is on the live site, so these
// tests see when it's loaded and that nothing is sent without its token.
vi.mock('./useListingSubmit', () => ({ TURNSTILE_ACTIVE: true }))
vi.mock('@/components/TurnstileWidget', () => ({
  default: ({ onVerify }: { onVerify: (token: string) => void }) => (
    <button type="button" onClick={() => onVerify('tok')}>
      pass the bot check
    </button>
  ),
}))

const { default: QuestionCard } = await import('./QuestionCard')

const food = makeCategory({
  id: 'restaurant',
  label: 'Food',
  pluralLabel: 'Food',
  questionCard: { kind: 'field', key: 't' },
  detailFields: [
    {
      key: 't',
      label: 'Food Type',
      type: 'select',
      options: [
        { value: 'Meat', label: 'Meat' },
        { value: 'Dairy', label: 'Dairy' },
        { value: 'Parve', label: 'Parve' },
      ],
    },
  ],
})
const items = [makeListing({ id: 'a', name: 'Sweet Box Bakery' }), makeListing({ id: 'b', name: 'Truck' })] as DirectoryResource[]

const fetchMock = vi.fn()
beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, id: 's1' }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const render = (category = food, onEdit = vi.fn()) =>
  renderWithProviders(<QuestionCard category={category} shown={items} all={items} place={() => null} onEdit={onEdit} />)

describe('QuestionCard: a quick question', () => {
  it('asks about the first place that doesn’t say', () => {
    render()
    expect(screen.getByRole('heading', { name: 'Quick question' })).toBeInTheDocument()
    expect(screen.getByText('Sweet Box Bakery: meat, dairy or parve?')).toBeInTheDocument()
  })

  it('loads the bot check only once an answer is tapped, and sends nothing before it passes', async () => {
    const user = userEvent.setup()
    render()
    expect(screen.queryByRole('button', { name: 'pass the bot check' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dairy' }))
    expect(screen.getByText('Sending…')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'pass the bot check' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('sends the answer as an edit of that one listing, saying where it came from', async () => {
    const user = userEvent.setup()
    render()
    await user.click(screen.getByRole('button', { name: 'Dairy' }))
    await user.click(screen.getByRole('button', { name: 'pass the bot check' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/^\/api\/submissions\?community=/)
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ operation: 'update', targetType: 'listing', targetId: 'a', turnstileToken: 'tok' })
    expect(body.payload.details.t).toBe('Dairy')
    expect(body.note).toBe('Answered the Food page’s question card: Food Type')
  })

  it('thanks, then asks about the next place, and doesn’t ask about the first again', async () => {
    const user = userEvent.setup()
    render()
    await user.click(screen.getByRole('button', { name: 'Dairy' }))
    await user.click(screen.getByRole('button', { name: 'pass the bot check' }))

    expect(await screen.findByText('Thanks! An admin will check it before it shows.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next question' }))
    expect(screen.getByText('Truck: meat, dairy or parve?')).toBeInTheDocument()

    cleanup()
    render()
    expect(screen.getByText('Truck: meat, dairy or parve?')).toBeInTheDocument()
  })

  it('moves on at "Not sure", sending nothing', async () => {
    const user = userEvent.setup()
    render()
    await user.click(screen.getByRole('button', { name: 'Not sure' }))
    expect(screen.getByText('Truck: meat, dairy or parve?')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says what went wrong, and a second tap tries again with a fresh bot check', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, errors: ['Too many requests.'] }), { status: 429 }))
    render()
    await user.click(screen.getByRole('button', { name: 'Dairy' }))
    await user.click(screen.getByRole('button', { name: 'pass the bot check' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests.')
    expect(screen.getByText('Sweet Box Bakery: meat, dairy or parve?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dairy' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'pass the bot check' }))
    expect(await screen.findByText('Thanks! An admin will check it before it shows.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('QuestionCard: been there lately?', () => {
  const grocery = makeCategory({ id: 'grocery', label: 'Grocery', questionCard: { kind: 'confirm' }, detailFields: [] })

  it('"Yes, still right" marks the place as current, without the bot check', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, confirmedAt: '2026-09-29T12:00:00Z' }), { status: 200 }))
    render(grocery)
    expect(screen.getByRole('heading', { name: 'Been there lately?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, still right' }))

    expect(await screen.findByText('Thanks! It’s marked as current.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/resource/a/confirm', { method: 'POST' })
    expect(screen.queryByRole('button', { name: 'pass the bot check' })).not.toBeInTheDocument()
  })

  it('"Something changed" opens the listing’s Edit', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(grocery, onEdit)
    await user.click(screen.getByRole('button', { name: 'Something changed' }))
    expect(onEdit).toHaveBeenCalledWith(items[0])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('QuestionCard: nothing to ask', () => {
  it('shows nothing when the category asks no question', () => {
    render(makeCategory({ detailFields: [] }))
    expect(screen.queryByTestId('question-card')).not.toBeInTheDocument()
  })
})
