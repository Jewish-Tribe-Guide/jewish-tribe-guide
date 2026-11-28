// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import CommunityEmailPage, { checkedWhen, scriptPreview, STOPPED_AFTER_MS, type CommunityEmailLoaded } from './CommunityEmailPage'
import type { NewslettersLoaded } from './NewslettersPage'

// Settings › Team › Community email (board E3, Nov 25): the guide's Gmail,
// then the newsletter script set up in it (moved here from Watches ›
// Newsletters, whose setup tests these were).

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/admin/team/email',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const SCRIPT = ['// The guide’s shul newsletters', "var SITE = 'https://guide.example'", "var COMMUNITY = 'philly'", "var KEY = 'nl_7f3cabcdefghijklmnopa91d'", 'function install() {}'].join('\n')

const own = (over: Partial<CommunityEmailLoaded> = {}): CommunityEmailLoaded => ({ email: null, canSave: true, checkedAt: null, lastEmailAt: null, ...over })
const script = (over: Partial<NewslettersLoaded> = {}): NewslettersLoaded => ({ available: true, script: SCRIPT, checkedAt: null, account: null, newsletters: [], places: [], ...over })

const posts: { url: string; body: Record<string, unknown> }[] = []
function show(a: CommunityEmailLoaded, b: NewslettersLoaded) {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      posts.push({ url: String(url), body: JSON.parse(String(init.body)) })
      return { ok: true }
    }
    return String(url).includes('community-email') ? a : b
  })
  return renderWithProviders(<CommunityEmailPage token="t" />)
}

afterEach(() => {
  cleanup()
  posts.length = 0
  vi.mocked(fetchJson).mockReset()
})

describe('CommunityEmailPage', () => {
  it('not set up: make a Gmail, its address, and the script steps dimmed until it’s saved (E3)', async () => {
    show(own(), script())
    expect(await screen.findByRole('link', { name: /Make a Gmail for the guide/ })).toHaveAttribute('href', 'https://accounts.google.com/signup')
    expect(screen.getByText('Not anyone’s own')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Team/ })).toHaveAttribute('href', '/test-community/admin/team')
    const box = screen.getByRole('region', { name: 'Read the newsletters' })
    expect(within(box).getAllByRole('listitem').map((s) => s.textContent)).toEqual([
      '3Sign it up for each shul’s and eruv’s emails',
      expect.stringMatching(/^4Copy the script/),
      '5Open script.google.com ↗Signed in as the guide’s Gmail. New project, then paste',
      '6Run install, then DeployWeb app, access Anyone',
      expect.stringMatching(/^7Copy the Web app URL/),
    ])
    expect(within(box).getByRole('button', { name: 'Copy the script' })).toBeDisabled()
    expect(within(box).getByLabelText('Web app URL')).toBeDisabled()
    expect(within(box).getByLabelText('Web app URL')).toHaveAttribute('placeholder', 'https://script.google.com/macros/s/…/exec')
  })

  // Tracker 100 (Nov 28): the site's own address, with nothing to make or
  // paste; the Gmail script's status only while it still runs.
  it('the site’s own address: no Gmail to make, no script steps', async () => {
    show(own({ email: 'philly@guide.example', received: true }), script())
    expect(await screen.findByText('philly@guide.example')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Its address' })).toHaveTextContent('Anything else comes to you')
    expect(screen.queryByRole('link', { name: /Make a Gmail/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Read the newsletters' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('link', { name: /The shuls’ and eruvs’ emails/ })).toBeInTheDocument()
  })

  it('saves its address', async () => {
    show(own(), script())
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Its address'), 'riverton.guide@gmail.com')
    // The first Save: the other is the script's link's, under it.
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])
    expect(posts).toEqual([{ url: expect.stringContaining('/api/admin/community-email'), body: { email: 'riverton.guide@gmail.com' } }])
  })

  it('address saved: the script steps from 1, and they work', async () => {
    show(own({ email: 'g@gmail.com' }), script())
    const box = await screen.findByRole('region', { name: 'Read the newsletters' })
    expect(within(box).getAllByRole('listitem')[0].textContent).toBe('1Sign it up for each shul’s and eruv’s emails')
    expect(screen.queryByRole('link', { name: /Make a Gmail/ })).toBeNull()
    expect(screen.getByLabelText('Its address')).toHaveValue('g@gmail.com')
    const user = userEvent.setup()
    await user.click(within(box).getByRole('button', { name: 'Copy the script' }))
    expect(await navigator.clipboard.readText()).toBe(SCRIPT)
  })

  it('before migration 116: says it can’t be saved yet', async () => {
    show(own({ canSave: false }), script())
    expect(await screen.findByText('It can’t be saved here yet.')).toBeInTheDocument()
  })

  it('running: where it checks and when, the steps behind Set up, and the emails it reads', async () => {
    const now = Date.now()
    show(
      own({ email: 'riverton.guide@gmail.com', lastEmailAt: new Date(now - 60_000).toISOString() }),
      script({ checkedAt: new Date(now - 20 * 60_000).toISOString(), account: 'riverton.guide@gmail.com', newsletters: [{ watchId: 'a', email: 'x@y.org', shul: 'Beth Israel', status: 'Last in Oct 27', bad: false, page: 'place/1' }] }),
    )
    expect(await screen.findByText('Checking riverton.guide@gmail.com')).toBeInTheDocument()
    expect(screen.getByText(/^Last checked /)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /The shuls’ and eruvs’ emails/ })).toHaveAttribute('href', '/test-community/admin/watches/newsletters')
    expect(screen.queryByRole('region', { name: 'Read the newsletters' })).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Set up' }))
    expect(screen.getByRole('region', { name: 'Read the newsletters' })).toBeInTheDocument()
  })

  it('says when it has stopped checking in', async () => {
    show(own({ email: 'g@gmail.com' }), script({ checkedAt: new Date(Date.now() - STOPPED_AFTER_MS - 60_000).toISOString(), account: 'g@gmail.com' }))
    expect(await screen.findByText('Stopped checking g@gmail.com')).toBeInTheDocument()
  })

  it('without migration 090, says the emails can’t be set up yet', async () => {
    show(own({ email: 'g@gmail.com' }), script({ available: false, script: null }))
    expect(await screen.findByText('The shuls’ and eruvs’ emails can’t be set up here yet.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Read the newsletters' })).toBeNull()
  })

  it('Read now on: the script can still be copied again, to update the running one (Nov 21)', async () => {
    show(own({ email: 'g@gmail.com' }), script({ checkedAt: new Date().toISOString(), account: 'g@gmail.com', readNow: true }))
    expect(await screen.findByText(/Read now on/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set up' })).toBeNull()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Update the script' }))
    const box = screen.getByRole('region', { name: 'Update the script' })
    expect(within(box).getByText(/New version/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Read the newsletters' })).toBeNull()
  })

  it('Copy the Web app URL: tried at once, and says if it doesn’t answer', async () => {
    const user = userEvent.setup()
    show(own({ email: 'g@gmail.com' }), script())
    const load = vi.mocked(fetchJson).getMockImplementation()!
    vi.mocked(fetchJson).mockImplementation(async (url, init, message) => {
      if (init?.method === 'POST') throw new Error('That link didn’t answer. Check access is set to Anyone.')
      return load(url, init, message)
    })
    await user.type(await screen.findByLabelText('Web app URL'), 'https://script.google.com/macros/s/AKfy/exec')
    const box = screen.getByRole('region', { name: 'Read the newsletters' })
    await user.click(within(box).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('That link didn’t answer. Check access is set to Anyone.')).toBeInTheDocument()
  })
})

describe('scriptPreview', () => {
  it('shows the site, the community and the key, shortened', () => {
    expect(scriptPreview(SCRIPT)).toBe("var SITE = 'https://guide.example'\nvar COMMUNITY = 'philly'\nvar KEY = 'nl_7f3c…a91d'")
  })
})

describe('checkedWhen', () => {
  it('the time today, the day before that', () => {
    const now = new Date(2026, 9, 29, 16, 0).getTime()
    expect(checkedWhen(new Date(2026, 9, 29, 15, 0).toISOString(), now)).toBe('3:00 PM')
    expect(checkedWhen(new Date(2026, 9, 27, 15, 0).toISOString(), now)).toBe('Oct 27, 3:00 PM')
  })
})
