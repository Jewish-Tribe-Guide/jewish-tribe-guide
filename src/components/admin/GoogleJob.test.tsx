// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { Checker, GoogleFieldRow, GooglePlace } from '@/lib/googleJob'
import GoogleJob, { googleSay } from './GoogleJob'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches/google',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.mocked(fetchJson).mockReset()
})

const LABEL = { name: 'Name', hours: 'Hours', phone: 'Phone', website: 'Website' } as const
const row = (field: GoogleFieldRow['field'], by: Checker, value: string): GoogleFieldRow => ({ field, label: LABEL[field], value, by })
const NOTHING: Checker = { kind: 'nothing' }
const GOOGLE: Checker = { kind: 'google' }

// The drawing's boards, as Philly had them Oct 22.
const TBZ: GooglePlace = {
  id: 'tbz',
  name: 'Temple Beth Zion-Beth Israel- Early Childhood Education',
  street: null,
  address: '1800 Spruce St, Philadelphia, PA',
  category: 'school',
  categoryLabel: 'Schools',
  href: '/philly/schools/tbz',
  matched: true,
  section: 'to_check',
  fields: [row('name', NOTHING, 'Temple Beth Zion-Beth Israel- Early Childhood Education'), row('hours', NOTHING, 'Closed every day'), row('phone', GOOGLE, '(215) 735-5148'), row('website', NOTHING, 'https://bzbi.org/learn/preschool')],
  readAt: '2026-10-18T14:00:00Z',
  failedAt: null,
  notOnGoogle: null,
  closure: null,
  compare: null,
}
const CHALAVITA: GooglePlace = {
  ...TBZ,
  id: 'chalavita',
  name: 'Chalavita',
  matched: false,
  fields: [row('name', NOTHING, 'Chalavita'), row('hours', { kind: 'website' }, 'Closed every day'), row('phone', { kind: 'website' }, '(929) 666-1482'), row('website', { kind: 'website' }, 'https://chalavita.com')],
  readAt: null,
}
const RITAS: GooglePlace = {
  ...TBZ,
  id: 'ritas',
  name: 'Rita’s Italian Ice & Frozen Custard',
  street: 'Grant Ave',
  section: 'checked',
  fields: [row('name', GOOGLE, 'Rita’s')],
  closure: { status: 'CLOSED_TEMPORARILY', shownOpen: false, since: '2026-10-12T14:00:00Z', readAt: '2026-10-21T14:00:00Z', kept: null },
}
const SABABA: GooglePlace = { ...TBZ, id: 'sababa', name: 'Sababa Falafel', section: 'cant_read', readAt: '2026-09-10T14:00:00Z', failedAt: '2026-10-22T14:00:00Z', fields: [row('name', { kind: 'google', at: '2026-09-10T14:00:00Z' }, 'Sababa Falafel')] }

function serve(places: GooglePlace[], after: Record<string, GooglePlace> = {}) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { action: string }
      return { ok: true, place: after[body.action] }
    }
    return { ok: true, counts: {}, places }
  })
  renderWithProviders(<GoogleJob token="tok" />, { community: { slug: 'philly' } })
}
const posted = () => vi.mocked(fetchJson).mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init!.body)))
const open = async (name: string) => {
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(name) }))
  return screen.getByRole('region', { name: new RegExp(name) })
}
const fieldRows = (region: HTMLElement) =>
  within(within(region).getByRole('region', { name: 'Fields' }))
    .getAllByTestId('box-row')
    .map((r) => [r.textContent, r.dataset.mark])

describe('the Google page', () => {
  it('says how many have a field nothing checks, with its three tabs', async () => {
    serve([TBZ, CHALAVITA, RITAS, SABABA])
    await waitFor(() => expect(screen.getByTestId('job-counts')).toHaveTextContent('2 listings have a field nothing checks.'))
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['To check 2', 'Can’t be read 1', 'Checked 1'])
    expect(screen.getAllByTestId('job-status').map((p) => p.textContent)).toEqual(['Not on Google', '3 not checked'])
    expect(googleSay(0)).toBe('Every field has something checking it.')
  })

  it('a field nothing checks is lit, who checks under its name; Check against Google asks Google, once, on a tap', async () => {
    serve([TBZ], { check: { ...TBZ, fields: TBZ.fields.map((f) => (f.field === 'website' ? { ...f, by: GOOGLE } : f)), compare: { at: '2026-10-22T14:00:00Z', rows: [
      { field: 'name', label: 'Name', google: 'BZBI Early Childhood Center', changed: true, raw: 'BZBI Early Childhood Center' },
      { field: 'hours', label: 'Hours', google: 'Mon–Fri 7:30 AM–6:00 PM', changed: true, raw: {} },
      { field: 'phone', label: 'Phone', google: '(215) 735-5148', changed: false },
      { field: 'website', label: 'Website', google: 'https://bzbi.org/learn/preschool', changed: false },
    ] } } })
    const region = await open('Temple Beth Zion')
    expect(posted()).toEqual([])
    expect(fieldRows(region)).toEqual([
      ['NameNothingTemple Beth Zion-Beth Israel- Early Childhood Education', 'changed'],
      ['HoursNothingClosed every day', 'changed'],
      ['PhoneGoogle(215) 735-5148', 'same'],
      ['WebsiteNothingbzbi.org/learn/preschool', 'changed'],
    ])
    expect(within(region).getByText('Google · read Oct 18')).toBeTruthy()
    await userEvent.click(within(region).getByRole('button', { name: 'Check against Google' }))
    expect(posted()).toEqual([{ action: 'check', id: 'tbz' }])
    await waitFor(() => expect(within(region).getByTestId('box-pill')).toHaveTextContent('2 changes'))
    expect(fieldRows(region)).toEqual([
      ['NameGoogleBZBI Early Childhood CenterTemple Beth Zion-Beth Israel- Early Childhood Education', 'changed'],
      ['HoursGoogleMon–Fri 7:30 AM–6:00 PMClosed every day', 'changed'],
      ['PhoneGoogle(215) 735-5148', 'same'],
      ['WebsiteGooglebzbi.org/learn/preschool', 'same'],
    ])
    expect(within(region).getAllByRole('button').slice(-3).map((b) => b.textContent)).toEqual(['Use Google’s', 'Edit', 'Keep the listing'])
    expect(within(region).getByText('From Google Maps · read Oct 22')).toBeTruthy()
    await userEvent.click(within(region).getByRole('button', { name: 'Keep the listing' }))
    expect(posted()[1]).toEqual({ action: 'keep', id: 'tbz' })
  })

  it('no match: Find it on Google and Not on Google, nothing asked until a tap', async () => {
    serve([CHALAVITA], { not_on_google: { ...CHALAVITA, section: 'checked', fields: CHALAVITA.fields.map((f) => (f.field === 'name' ? { ...f, by: { kind: 'you', at: '2026-10-22T14:00:00Z' } } : f)) } })
    const region = await open('Chalavita')
    expect(fieldRows(region).map(([t]) => t)).toEqual(['NameNothingChalavita', 'HoursIts websiteClosed every day', 'PhoneIts website(929) 666-1482', 'WebsiteIts websitechalavita.com'])
    expect(within(region).getAllByRole('button').slice(-2).map((b) => b.textContent)).toEqual(['Find it on Google', 'Not on Google'])
    expect(posted()).toEqual([])
    await userEvent.click(within(region).getByRole('button', { name: 'Not on Google' }))
    expect(posted()).toEqual([{ action: 'not_on_google', id: 'chalavita' }])
    // It moves to Checked straight away.
    await waitFor(() => expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['To check 0', 'Can’t be read 0', 'Checked 1']))
  })

  it('Find it on Google searches on the tap, and This one picks the match', async () => {
    vi.mocked(fetchJson).mockImplementation(async (_url, init) => {
      if (init?.method !== 'POST') return { ok: true, places: [CHALAVITA] }
      const body = JSON.parse(String(init.body)) as { action: string }
      if (body.action === 'find') return { ok: true, found: [{ placeId: 'p1', name: 'Chalavita', address: '198 Tomlinson Rd, Philadelphia' }] }
      return { ok: true, place: { ...CHALAVITA, matched: true } }
    })
    renderWithProviders(<GoogleJob token="tok" />, { community: { slug: 'philly' } })
    const region = await open('Chalavita')
    await userEvent.click(within(region).getByRole('button', { name: 'Find it on Google' }))
    const found = await screen.findByRole('list', { name: 'Found on Google' })
    expect(found).toHaveTextContent('Chalavita198 Tomlinson Rd, PhiladelphiaThis one')
    await userEvent.click(within(found).getByRole('button', { name: 'This one' }))
    expect(posted()).toEqual([
      { action: 'find', id: 'chalavita' },
      { action: 'pick', id: 'chalavita', placeId: 'p1' },
    ])
  })

  it('Can’t be read: when Google last answered, and Find it on Google to match it again', async () => {
    serve([SABABA])
    await userEvent.click(await screen.findByRole('tab', { name: /Can’t be read/ }))
    const region = await open('Sababa')
    expect(screen.getAllByTestId('job-status')[0]).toHaveTextContent('Not read since Sep 10')
    expect(fieldRows(region)[0][0]).toBe('NameGoogle · Sep 10Sababa Falafel')
    expect(within(region).getByRole('button', { name: 'Find it on Google' })).toBeTruthy()
    expect(within(region).getByText('Google · didn’t answer Oct 22')).toBeTruthy()
  })

  it('Checked: a closure is its own box with Show as open; a shared name shows its street', async () => {
    serve([RITAS], { open: { ...RITAS, closure: { ...RITAS.closure!, shownOpen: true } } })
    await userEvent.click(await screen.findByRole('tab', { name: /Checked/ }))
    const region = await open('Rita’s Italian Ice & Frozen Custard · Grant Ave')
    const box = within(region).getByRole('region', { name: 'Open or closed' })
    expect(box).toHaveTextContent('Closed for now since Oct 12')
    expect(box).toHaveTextContent('From Google Maps · read Oct 21 · on the site at once')
    await userEvent.click(within(box).getByRole('button', { name: 'Show as open' }))
    expect(posted()).toEqual([{ action: 'open', id: 'ritas', open: true }])
  })
})
