// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import ReadFrom, { type ReadFromProps } from './ReadFrom'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/philly/admin/places', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const posts: { url: string; body: Record<string, unknown> }[] = []
function serve(waiting = false) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      posts.push({ url: String(url), body: JSON.parse(String(init.body)) })
      return { ok: true }
    }
    if (String(url).includes('/api/admin/community-email')) return { email: 'phillyguide@gmail.com' }
    if (String(url).includes('/api/admin/watches/newsletters')) return { newsletters: waiting ? [{ watchId: 'w9', email: 'office@leyv.org', shul: null, status: '', bad: false, page: '' }] : [] }
    throw new Error('down')
  })
}

const props = (over: Partial<ReadFromProps> = {}): ReadFromProps => ({
  placeId: 'leyv',
  token: 'tok',
  facts: { kind: 'shuls', website: null, site: null, emails: [], google: { matched: true }, lists: [], refuah: false },
  read: null,
  saveWebsite: vi.fn(async () => {}),
  linkEmail: vi.fn(async () => {}),
  onChanged: vi.fn(async () => {}),
  ...over,
})
const show = (p: ReadFromProps) => renderWithProviders(<ReadFrom {...p} />, { community: { slug: 'philly' } })

afterEach(() => {
  posts.length = 0
  cleanup()
  vi.mocked(fetchJson).mockReset()
})

describe('Read from (board W3)', () => {
  it('a website not set is added from its row', async () => {
    serve()
    const p = props()
    show(p)
    const row = screen.getByTestId('read-from-website')
    expect(row).toHaveTextContent('Not set')
    await userEvent.type(within(row).getByLabelText('Its website'), 'leyvhair.org')
    await userEvent.click(within(row).getByRole('button', { name: 'Save' }))
    expect(p.saveWebsite).toHaveBeenCalledWith('leyvhair.org')
    expect(p.onChanged).toHaveBeenCalled()
  })

  it('a shul’s emails: sign up as the community email, and copy it', async () => {
    serve()
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    show(props())
    const row = await screen.findByText('Sign up as phillyguide@gmail.com')
    await userEvent.click(within(row.closest('[data-testid]') as HTMLElement).getByRole('button', { name: 'Copy address' }))
    expect(writeText).toHaveBeenCalledWith('phillyguide@gmail.com')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('an email from a sender linked to nothing is linked from here', async () => {
    serve(true)
    const p = props()
    show(p)
    expect(await screen.findByText('An email from office@leyv.org came in')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Link it' }))
    expect(p.linkEmail).toHaveBeenCalledWith({ id: 'w9', sender: 'office@leyv.org' })
  })

  it('a website set: Read now reads it as the nightly run would, and Change opens its field', async () => {
    serve()
    show(props({ facts: { kind: 'shuls', website: 'https://mekor.org', site: { ok: true }, emails: [], lists: [], refuah: false }, read: { job: 'times', resourceId: 'mekor' } }))
    const row = screen.getByTestId('read-from-website')
    expect(row).toHaveTextContent('mekor.org · every night')
    expect(within(row).getByRole('img', { name: 'Read' })).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: 'Read now' }))
    expect(posts[0]).toEqual({ url: '/api/admin/watches/hours?job=times&community=philly', body: { action: 'check', resourceId: 'mekor' } })
    expect(await within(row).findByRole('button', { name: 'Read just now' })).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: 'Change' }))
    expect(within(row).getByLabelText('Its website')).toBeInTheDocument()
  })

  it('food reads no emails, and its menu link is added from its row', async () => {
    const saveMenu = vi.fn(async () => {})
    show(props({ facts: { kind: 'food', website: 'https://a.com', site: null, emails: [], menu: null, lists: ['Keystone-K’s list'], refuah: false }, saveMenu }))
    expect(screen.queryByTestId('read-from-emails')).toBeNull()
    expect(vi.mocked(fetchJson)).not.toHaveBeenCalled()
    expect(screen.getByTestId('read-from-lists')).toHaveTextContent('On Keystone-K’s list')
    const menu = screen.getByTestId('read-from-menu')
    await userEvent.type(within(menu).getByLabelText('Its menu link'), 'a.com/menu')
    await userEvent.click(within(menu).getByRole('button', { name: 'Save' }))
    expect(saveMenu).toHaveBeenCalledWith('a.com/menu')
  })
})
