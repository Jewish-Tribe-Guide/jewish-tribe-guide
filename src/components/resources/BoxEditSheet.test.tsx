// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import type { CategoryField } from '@/lib/categories'
import { minyanWriting } from '@/lib/minyanText'
import BoxEditSheet, { BoxEditor } from './BoxEditSheet'

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

// A shul's usual box (Oct 10, canvas page "Minyan edit"): its minyanim as a
// list, one opened at a time, every change sent together.
describe('BoxEditor, a shul’s usual Shabbos times', () => {
  const minyanim: CategoryField = { key: 'minyanim', label: 'Davening', type: 'minyanim', renderAs: 'row' }
  const shuls = makeCategory({ id: 'synagogue', detailFields: [minyanim] })
  const shul = makeListing({
    id: '5d0a7c1e-2f55-4a8e-9d57-3b7f0d6f4a21',
    name: 'Mekor Habracha',
    minyanim: [
      { id: 'mm', tefillah: 'mincha_maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'], time: '15 min before sunset', anchor: 'sunset', offsetMinutes: -15 },
      { id: 'sh', tefillah: 'shacharis', days: ['sat'], time: '9:15am' },
      { id: 'wk', tefillah: 'shacharis', days: ['mon', 'thu'], time: '6:45am' },
    ],
  })
  const edit = { title: 'Usual Shabbos times', fields: [minyanim], minyanimBox: 'shabbos' as const, writing: minyanWriting }
  const open = () => renderWithProviders(<BoxEditSheet item={shul} category={shuls} edit={edit} onClose={vi.fn()} />)

  it('lists the box as it reads, in the order of Shabbos, and nothing of the week', () => {
    open()
    const list = screen.getByTestId('minyan-box-list')
    expect(within(list).getAllByRole('button', { name: /^(Mincha|Shacharis)/ }).map((b) => b.textContent)).toEqual([
      'Mincha & Maariv 15 min before sunset',
      'Shacharis 9:15 AM',
    ])
    expect(within(list).getByText('Friday night')).toBeInTheDocument()
    expect(within(list).queryByText(/6:45/)).not.toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'No changes yet' })).toBeDisabled()
  })

  it('opens one minyan, Done marks it changed on the list, and Send sends only that part of the row', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    open()
    fireEvent.click(screen.getByRole('button', { name: /^Mincha & Maariv/ }))
    const sheet = screen.getByRole('dialog', { name: 'Mincha & Maariv' })
    // Which box and which shul, on one line under the minyan's name.
    expect(within(sheet).getByText('Usual Shabbos times · Mekor Habracha')).toBeInTheDocument()
    expect(within(sheet).queryByText('Mekor Habracha')).not.toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'From a zman' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(within(sheet).getByLabelText('Offset in minutes'), { target: { value: '25' } })
    // Time of year and earliest/latest wait under More.
    expect(within(sheet).queryByRole('group', { name: 'Time of year' })).not.toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))

    const list = screen.getByTestId('minyan-box-list')
    expect(within(list).getByRole('button', { name: /25 min before sunset.*Changed/ })).toBeInTheDocument()
    fireEvent.click(within(list).getByRole('button', { name: 'Send 1 change' }))
    await screen.findByTestId('box-edit-sent')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]!.body))
    const sent = body.details?.minyanim ?? body.proposed?.minyanim ?? JSON.parse(JSON.stringify(body)).minyanim
    const rows = (sent ?? findMinyanim(body)) as { id: string; days: string[]; time: string }[]
    // The weekday part of the row is as it was; Friday night is the change.
    expect(rows.find((r) => r.id === 'mm')).toMatchObject({ days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '15 min before sunset' })
    expect(rows.find((r) => r.id === 'mm-shabbos')).toMatchObject({ days: ['fri'], anchor: 'sunset', offsetMinutes: -25 })
    expect(rows.find((r) => r.id === 'wk')).toMatchObject({ time: '6:45am' })
  })

  it('adds a minyan on Shabbos, and takes one out, as two changes', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Add a minyan' }))
    const add = screen.getByRole('dialog', { name: 'Add a minyan' })
    expect(within(add).getByRole('button', { name: 'Shabbos' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(add).queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    expect(within(add).getByRole('button', { name: 'Done' })).toBeDisabled()
    fireEvent.change(within(add).getByLabelText('Tefillah'), { target: { value: 'mincha' } })
    fireEvent.change(within(add).getByLabelText('Time'), { target: { value: '12:20pm' } })
    fireEvent.click(within(add).getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: /^Mincha 12:20 PM.*New/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Shacharis/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove this minyan' }))
    expect(screen.queryByRole('button', { name: /^Shacharis/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send 2 changes' })).toBeEnabled()
  })

  it('says a minyan’s time of year once, with its note', () => {
    const winter = makeListing({ id: shul.id, minyanim: [{ id: 'k', tefillah: 'mincha', days: ['sat'], time: '12:20pm', season: 'winter', notes: 'Following Kiddush' }] })
    renderWithProviders(<BoxEditSheet item={winter} category={shuls} edit={edit} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^Mincha 12:20 PM/ })).toHaveTextContent(/Winter only · Following Kiddush$/)
    fireEvent.click(screen.getByRole('button', { name: /^Mincha 12:20 PM/ }))
    // A minyan that has one opens with More open, its season chosen.
    expect(screen.getByRole('button', { name: 'Winter' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Back from a minyan leaves it as it was', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /^Shacharis/ }))
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '9:30am' } })
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByRole('button', { name: /^Shacharis 9:15 AM$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No changes yet' })).toBeDisabled()
  })
})

/** The minyanim list wherever the submission carries it. */
function findMinyanim(v: unknown): unknown {
  if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && 'tefillah' in x)) return v
  if (v && typeof v === 'object') for (const x of Object.values(v)) {
    const found = findMinyanim(x)
    if (found) return found
  }
  return undefined
}
