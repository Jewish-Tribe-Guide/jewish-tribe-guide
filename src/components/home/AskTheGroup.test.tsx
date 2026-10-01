// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import AskTheGroup from './AskTheGroup'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

// "Nothing in the guide yet" (agreed Oct 1): ask a group with the question
// written, or say where it's sold, for an admin to check.
const grocery = makeCategory({ id: 'grocery', label: 'Grocery', detailFields: [{ key: 'm', label: 'Kosher items here', type: 'tags', showCountInHeader: true }] })
const spruce = makeListing({ id: '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21', category: 'grocery', name: 'Spruce Market', m: ['Challah'] })
const giant = makeListing({ id: 'giant', category: 'grocery', name: 'GIANT', m: ['Wine'] })
const base = { query: 'rugelach', nothingClose: true, askHref: '/philly/whatsapp', addHref: '/philly/grocery?form=create', sharePath: '/philly/ask/rugelach' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

afterEach(() => cleanup())

describe('Ask a WhatsApp group', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('opens the share menu with the question written, and the question’s own link', () => {
    const shareFn = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: shareFn })
    renderWithProviders(<AskTheGroup {...base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask a WhatsApp group' }))
    expect(shareFn).toHaveBeenCalledWith({
      title: 'rugelach',
      text: 'Does anyone know where to get rugelach? It’s not in the guide yet. If you know, add it there and this link will answer it:',
      url: `${window.location.origin}/philly/ask/rugelach`,
    })
    expect(screen.getByRole('link', { name: /See the community’s groups/ })).toHaveAttribute('href', '/philly/whatsapp')
  })
})

describe('Know where to find it?', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => fetchMock.mockRestore())
  const open = () => {
    renderWithProviders(<AskTheGroup {...base} item="rugelach" listings={[spruce, giant]} categories={[grocery]} />)
    fireEvent.click(screen.getByRole('button', { name: /Know where to find it/ }))
  }

  it('asks where, with the item filled in, and picks from the guide’s own places', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true, item: 'Rugelach', sometimes: false, submissionId: '9a6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a99' }))
    open()
    expect(screen.getByTestId('where-seen')).toHaveTextContent('Seen rugelach somewhere?')
    expect(screen.getByRole('button', { name: 'Pick a place' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Where\?/), { target: { value: 'spru' } })
    expect(screen.queryByRole('button', { name: /GIANT/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Spruce Market/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add rugelach at Spruce Market' }))
    expect(await screen.findByTestId('where-seen-done')).toHaveTextContent('✓ Thanks! Rugelach at Spruce Market')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/resource/${spruce.id}/item/add`)
    expect(JSON.parse(String(init.body))).toMatchObject({ item: 'rugelach', sometimes: false, from: 'question' })
    // Nothing to undo: it only waits for an admin.
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('says so when the place already lists it', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true, already: { item: 'Rugelach', field: 'm' } }))
    open()
    fireEvent.change(screen.getByLabelText(/Where\?/), { target: { value: 'spruce' } })
    fireEvent.click(screen.getByRole('button', { name: /Spruce Market/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add rugelach at Spruce Market' }))
    expect(await screen.findByTestId('where-seen-done')).toHaveTextContent('Spruce Market already has Rugelach in the guide.')
  })

  it('a place not in the guide goes to the new-place form', () => {
    open()
    fireEvent.change(screen.getByLabelText(/Where\?/), { target: { value: 'zabars' } })
    expect(screen.getByText('No place in the guide by that name.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Add a new place/ })).toHaveAttribute('href', '/philly/grocery?form=create')
  })

  it('a question that isn’t about an item keeps today’s link', () => {
    renderWithProviders(<AskTheGroup {...base} query="dentist" addHref="/philly/feedback?about=dentist" />)
    expect(screen.getByRole('link', { name: /Know where to find it/ })).toHaveAttribute('href', '/philly/feedback?about=dentist')
  })
})
