// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import type { Watch } from '@/lib/watches'
import WatchesManager from './WatchesManager'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/watches',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const SHUL = { id: 'shul-1', name: 'Lower Merion Synagogue', categoryLabel: 'Synagogue' }

function watch(over: Partial<Watch>): Watch {
  return {
    id: 'w',
    communityId: 'philly',
    kind: 'website',
    url: 'https://example.org/',
    resourceId: null,
    label: null,
    active: true,
    createdAt: ago(10),
    createdBy: null,
    lastRunAt: ago(0.1),
    lastOkAt: ago(0.1),
    lastError: null,
    failingSince: null,
    lastFiled: null,
    pageHash: 'h',
    pageChangedAt: null,
    ...over,
  }
}

async function renderTab(watches: Watch[], { available = true, post = {} as Record<string, unknown> } = {}) {
  vi.mocked(fetchJson).mockImplementation(async (_url, init) =>
    init?.method === 'POST' ? { ok: true, ...post } : { ok: true, available, watches, listings: [SHUL] },
  )
  renderWithProviders(<WatchesManager token="tok" />, { community: { slug: 'philly' } })
  await screen.findByText(/Pages the guide reads on its own/)
}

afterEach(() => {
  cleanup()
  vi.mocked(fetchJson).mockReset()
})

describe('WatchesManager', () => {
  it('says plainly which watch is broken, since when and why', async () => {
    await renderTab([
      watch({ id: 'k', kind: 'keystone_list', label: 'Keystone-K’s list', lastFiled: 3 }),
      watch({ id: 'b', label: 'BZBI worship page', failingSince: ago(2), lastError: 'The page answered 403', lastOkAt: ago(3) }),
    ])
    const [keystone, bzbi] = screen.getAllByTestId('watch-row')
    expect(within(keystone).getByText(/^Working/)).toBeInTheDocument()
    expect(within(keystone).getByText(/Last read: 3 suggestions/)).toBeInTheDocument()
    expect(within(bzbi).getByText(/Not working since .*: The page answered 403/)).toBeInTheDocument()
  })

  // The cron itself can stop, and then nothing fails: the last result just
  // sits there looking fine. The tab must not let it.
  it('flags a watch that hasn’t run in days, even though its last run worked', async () => {
    await renderTab([watch({ lastRunAt: ago(4), lastOkAt: ago(4) })])
    expect(screen.getByText(/The daily run may have stopped/)).toBeInTheDocument()
  })

  it('shows the listing a page keeps current, and when its page changed', async () => {
    await renderTab([watch({ resourceId: 'shul-1', pageChangedAt: ago(1) })])
    expect(screen.getByText('Keeps current: Lower Merion Synagogue (Synagogue)')).toBeInTheDocument()
    expect(screen.getByText(/Changed .*: worth a look/)).toBeInTheDocument()
  })

  // Oct 17: a hospital's Refuah page is compared with the hospital, so it
  // says what it files, not "checked for a change".
  it('says a Refuah hospital page is compared with its hospital, and what it filed', async () => {
    await renderTab([watch({ url: 'https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5', resourceId: 'shul-1', lastFiled: 1, pageChangedAt: ago(1) })])
    expect(screen.getByText(/Compared with the hospital every morning/)).toBeInTheDocument()
    expect(screen.getByText(/Last read: 1 suggestion\./)).toBeInTheDocument()
    expect(screen.queryByText(/worth a look/)).toBeNull()
  })

  it('says Mekor Habracha’s list is compared with the guide, IKC above all, and what it filed', async () => {
    await renderTab([watch({ url: 'https://www.mekorhabracha.org/center-city', label: 'Mekor Habracha’s list', lastFiled: 18, pageHash: null })])
    expect(screen.getByTestId('mekor-watch')).toHaveTextContent(/Compared with the guide every morning.*IKC above all.*Last read: 18 suggestions\./)
    expect(screen.queryByText(/Checked every morning for a change/)).toBeNull()
  })

  // Oct 17: a food place's menu watch, made by the daily run, says what it
  // does and how to stop it (taking it off only brings it back tomorrow).
  it('says a menu watch is the run’s own, that the AI reads only a change, and to pause it to stop it', async () => {
    await renderTab([watch({ url: 'https://judah.example/menu', resourceId: 'shul-1', createdBy: 'menu links', lastFiled: 1, pageChangedAt: ago(1) })])
    const line = screen.getByTestId('menu-watch')
    expect(line).toHaveTextContent(/When the menu changes, the AI reads it/)
    expect(line).toHaveTextContent(/pause it to stop it/)
    expect(line).toHaveTextContent(/Last changed .*\. Last read: new dishes for the Main dishes tab\./)
    expect(screen.queryByText(/worth a look/)).toBeNull()
  })

  it('adds a page, tied to a listing picked by name', async () => {
    const created = watch({ id: 'new', url: 'https://lowermerionsynagogue.org/', label: 'Weekly times' })
    await renderTab([], { post: { watch: created } })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/^Web address/), 'lowermerionsynagogue.org')
    await user.type(screen.getByLabelText(/The listing it keeps current/), 'Lower Merion Synagogue')
    await user.type(screen.getByLabelText(/Name/), 'Weekly times')
    await user.click(screen.getByRole('button', { name: 'Watch this page' }))
    const [, init] = vi.mocked(fetchJson).mock.calls.find(([, i]) => i?.method === 'POST')!
    expect(JSON.parse(String(init!.body))).toEqual({ action: 'add', url: 'lowermerionsynagogue.org', resourceId: 'shul-1', label: 'Weekly times' })
    expect(await screen.findByText('Weekly times')).toBeInTheDocument()
  })

  it('says the migration is needed, and that Keystone-K is still read, before 070', async () => {
    await renderTab([], { available: false })
    expect(screen.getByText(/needs database migration 070/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Watch this page' })).not.toBeInTheDocument()
  })

  // Shul newsletters (newsletter.ts): a sender the inbox hasn't seen comes
  // in unlinked, to be tied to its shul here.
  it('asks which shul a new newsletter sender is, and links it', async () => {
    const sender = watch({ id: 'n', url: 'mailto:info@lms.org', label: 'Lower Merion Synagogue', createdBy: 'shul newsletters', active: false, lastRunAt: null, lastOkAt: null })
    await renderTab([sender], { post: { watch: { ...sender, resourceId: 'shul-1', active: true } } })
    const row = screen.getByTestId('watch-row')
    expect(within(row).getByText('Newsletter from info@lms.org')).toBeInTheDocument()
    expect(within(row).getByText(/Not linked to a shul yet/)).toBeInTheDocument()
    // Nothing to check or pause until it's linked.
    expect(within(row).queryByRole('button', { name: 'Check now' })).toBeNull()
    const user = userEvent.setup()
    const link = within(row).getByRole('button', { name: 'Link' })
    expect(link).toBeDisabled()
    await user.type(within(row).getByLabelText('The shul it’s from'), 'Lower Merion Synagogue')
    await user.click(link)
    const [, init] = vi.mocked(fetchJson).mock.calls.find(([, i]) => i?.method === 'POST')!
    expect(JSON.parse(String(init!.body))).toEqual({ action: 'link', id: 'n', resourceId: 'shul-1' })
    expect(await within(row).findByTestId('newsletter-watch')).toHaveTextContent(/No newsletter read yet/)
    expect(within(row).getByText(/Keeps current: Lower Merion Synagogue/)).toBeInTheDocument()
  })

  it('says when a linked newsletter last came, and that a quiet month is flagged', async () => {
    await renderTab([watch({ url: 'mailto:info@lms.org', resourceId: 'shul-1', createdBy: 'shul newsletters', lastFiled: 1, pageChangedAt: ago(3) })])
    const line = screen.getByTestId('newsletter-watch')
    expect(line).toHaveTextContent(/emailed if none comes for a month/)
    expect(line).toHaveTextContent(/Last newsletter .*\. Last read: 1 suggestion\./)
  })

  it('skips a sender that isn’t a shul', async () => {
    const sender = watch({ id: 'n', url: 'mailto:no-reply@accounts.google.com', createdBy: 'shul newsletters', active: false })
    await renderTab([sender], { post: { watch: { ...sender, createdBy: 'shul newsletters: not a shul' } } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Not a shul' }))
    const [, init] = vi.mocked(fetchJson).mock.calls.find(([, i]) => i?.method === 'POST')!
    expect(JSON.parse(String(init!.body))).toEqual({ action: 'ignore', id: 'n' })
    expect(await screen.findByText(/Not a shul: its emails are skipped/)).toBeInTheDocument()
  })

  // Oct 18: the list had grown to one long column of menus, hospitals and
  // newsletters. It's grouped, a long group starts closed, and a watch that
  // needs a look shows anyway, named in its group's heading.
  it('groups the watches, and a closed group still shows what’s broken', async () => {
    const menus = ['Bar Bombon', 'Goldie', 'Mama’s', 'Rita’s', 'Zevi’s'].map((name, i) =>
      watch({ id: `m${i}`, label: `${name} menu`, url: `https://m${i}.example/menu`, resourceId: 'shul-1', createdBy: 'menu links' }),
    )
    menus[3] = { ...menus[3], failingSince: ago(1), lastError: 'The page answered 404' }
    await renderTab([watch({ id: 'k', kind: 'keystone_list', label: 'Keystone-K’s list' }), ...menus])
    const [kosher, menuGroup] = screen.getAllByTestId('watch-group')
    expect(kosher).toHaveAccessibleName('Kosher lists')
    expect(within(kosher).getAllByTestId('watch-row')).toHaveLength(1)
    expect(menuGroup).toHaveAccessibleName('Menus')
    const toggle = within(menuGroup).getByRole('button', { name: /Menus.*5.*1 not working.*Show all 5/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(menuGroup).getAllByTestId('watch-row').map((r) => r.querySelector('p')!.textContent)).toEqual(['Rita’s menu'])
    await userEvent.setup().click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Broken first, then by name.
    expect(within(menuGroup).getAllByTestId('watch-row').map((r) => r.querySelector('p')!.textContent)).toEqual([
      'Rita’s menu',
      'Bar Bombon menu',
      'Goldie menu',
      'Mama’s menu',
      'Zevi’s menu',
    ])
  })

  it('keeps a newsletter sender in view after it’s linked, even in a closed group', async () => {
    const linked = ['a', 'b', 'c', 'd', 'e'].map((x) => watch({ id: x, url: `mailto:${x}@shul.org`, resourceId: 'shul-1', createdBy: 'shul newsletters' }))
    const sender = watch({ id: 'n', url: 'mailto:info@lms.org', label: 'New sender', createdBy: 'shul newsletters', active: false, lastRunAt: null, lastOkAt: null })
    await renderTab([...linked, sender], { post: { watch: { ...sender, resourceId: 'shul-1', active: true } } })
    const group = screen.getByRole('region', { name: 'Shul newsletters' })
    expect(within(group).getByRole('button', { name: /6.*1 to link.*Show all 6/ })).toBeInTheDocument()
    const row = within(group).getByTestId('watch-row')
    const user = userEvent.setup()
    await user.type(within(row).getByLabelText('The shul it’s from'), 'Lower Merion Synagogue')
    await user.click(within(row).getByRole('button', { name: 'Link' }))
    expect(await within(row).findByTestId('newsletter-watch')).toBeInTheDocument()
    expect(within(group).getAllByTestId('watch-row')).toEqual([row])
    expect(within(group).queryByText(/to link/)).toBeNull()
  })
})
