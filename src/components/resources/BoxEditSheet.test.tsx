// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { CategoryField } from '@/lib/categories'
import { BoxEditor } from './BoxEditSheet'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// Edit under one box (agreed Oct 10): that box's fields alone, Send once
// something changed, and "Edit something else here" only after it's sent.
const notes: CategoryField = { key: 'women_notes', label: 'Notes', type: 'textarea', renderAs: 'row', audienceKey: 'women' }
const phone: CategoryField = { key: 'women_phone', label: 'Phone', type: 'tel', renderAs: 'row', audienceKey: 'women' }
const mikvah = makeCategory({ id: 'mikvah', detailFields: [{ key: 'women', label: 'Women', type: 'boolean', renderAs: 'badge' }, notes, phone] })
const item = makeListing({ id: '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21', name: 'Lower Merion Mikvah', women: true, women_notes: 'By appointment on Shabbos.', women_phone: '2155550100' })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BoxEditor', () => {
  it('shows only the box’s fields, and nothing to send until something changed', () => {
    renderWithProviders(<BoxEditor item={item} category={mikvah} edit={{ title: 'Women’s', fields: [notes] }} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Notes')).toHaveValue('By appointment on Shabbos.')
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No changes yet' })).toBeDisabled()
    // Nothing else to do on this screen.
    expect(screen.queryByRole('button', { name: /something else/i })).not.toBeInTheDocument()
  })

  it('sends the change as an edit of the listing, then says it’s sent, and only then offers the rest', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const onEditElse = vi.fn()
    renderWithProviders(<BoxEditor item={item} category={mikvah} edit={{ title: 'Women’s', fields: [notes] }} onClose={vi.fn()} onEditElse={onEditElse} />)
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'By appointment, one hour after candle lighting.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    const sent = await screen.findByTestId('box-edit-sent')
    expect(sent).toHaveTextContent('Sent')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/^\/api\/submissions\?community=/)
    const body = JSON.parse(String(init!.body))
    expect(body).toMatchObject({ operation: 'update', targetType: 'listing', targetId: item.id })
    expect(JSON.stringify(body)).toContain('one hour after candle lighting')
    fireEvent.click(within(sent).getByRole('button', { name: 'Edit something else here' }))
    expect(onEditElse).toHaveBeenCalled()
  })
})
