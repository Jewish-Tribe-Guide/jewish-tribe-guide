// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import NewslettersPage, { checkedWhen, scriptPreview, STOPPED_AFTER_MS, type NewslettersLoaded } from './NewslettersPage'

// Watches → Newsletters (admin drawings 18 and 18b, Oct 29): a new
// community sets up its Gmail script from here, and keeps its shuls'
// newsletters here.

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/admin/watches/newsletters',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

const SCRIPT = ['// The guide’s shul newsletters', "var SITE = 'https://guide.example'", "var COMMUNITY = 'philly'", "var KEY = 'nl_7f3cabcdefghijklmnopa91d'", 'function install() {}'].join('\n')
const PLACES = [{ id: 'shul-1', name: 'Beth Israel', categoryLabel: 'Synagogues' }]

function loaded(over: Partial<NewslettersLoaded> = {}): NewslettersLoaded {
  return { available: true, script: SCRIPT, checkedAt: null, account: null, newsletters: [], places: PLACES, ...over }
}

const posts: Record<string, unknown>[] = []
function show(data: NewslettersLoaded) {
  vi.mocked(fetchJson).mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)))
      return { ok: true }
    }
    return data
  })
  return renderWithProviders(<NewslettersPage token="t" />)
}

afterEach(() => {
  cleanup()
  posts.length = 0
  vi.mocked(fetchJson).mockReset()
})

describe('NewslettersPage', () => {
  it('not set up yet: the four steps, and the script copied whole', async () => {
    show(loaded())
    expect(await screen.findByText('Not set up yet')).toBeInTheDocument()
    const steps = within(screen.getByRole('region', { name: 'Set it up' })).getAllByRole('listitem')
    expect(steps.map((s) => s.textContent)).toEqual([
      '1Make a Gmail for the guideSign it up for each shul’s newsletter',
      expect.stringMatching(/^2Copy the script/),
      '3Open script.google.com ↗New project, then paste over what’s there',
      '4Run installPick install at the top, press Run, then Allow',
    ])
    expect(screen.getByRole('link', { name: /Open script\.google\.com/ })).toHaveAttribute('target', '_blank')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Copy the script' }))
    expect(await navigator.clipboard.readText()).toBe(SCRIPT)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(screen.getByText('None yet')).toBeInTheDocument()
  })

  it('running: where it checks and when, the steps behind Set up again', async () => {
    const now = Date.now()
    show(loaded({ checkedAt: new Date(now - 20 * 60_000).toISOString(), account: 'riverton.guide@gmail.com' }))
    expect(await screen.findByText('Checking riverton.guide@gmail.com every hour')).toBeInTheDocument()
    expect(screen.getByText(/^Last checked /)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Set it up' })).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Set up again' }))
    expect(screen.getByRole('region', { name: 'Set it up' })).toBeInTheDocument()
  })

  it('says when it has stopped checking in', async () => {
    show(loaded({ checkedAt: new Date(Date.now() - STOPPED_AFTER_MS - 60_000).toISOString(), account: 'g@gmail.com' }))
    expect(await screen.findByText('Stopped checking g@gmail.com')).toBeInTheDocument()
  })

  it('without migration 090, says it can’t be set up yet', async () => {
    show(loaded({ available: false, script: null }))
    expect(await screen.findByText('Newsletters can’t be set up here yet.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Set it up' })).toBeNull()
  })

  it('adds a newsletter with its shul', async () => {
    show(loaded())
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add a newsletter' }))
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText('Shul'), 'Beth Israel')
    await user.type(screen.getByLabelText('Its newsletter’s email'), 'office@bethisrael.org')
    await user.click(add)
    expect(posts).toEqual([{ action: 'add', purpose: 'times', url: 'office@bethisrael.org', resourceId: 'shul-1' }])
  })

  it('lists each with its shul, and links or skips a sender with none', async () => {
    show(
      loaded({
        checkedAt: new Date().toISOString(),
        newsletters: [
          { watchId: 'n', email: 'x@y.org', shul: null, status: 'Not linked to a shul', bad: true, page: '' },
          { watchId: 'a', email: 'news@bi.org', shul: 'Beth Israel', status: 'Last in Oct 27', bad: false, page: 'kind/synagogue?place=shul-1' },
        ],
      }),
    )
    const row = await screen.findByRole('link', { name: /Beth Israel/ })
    expect(row).toHaveAttribute('href', '/test-community/admin/watches/kind/synagogue?place=shul-1')
    expect(row).toHaveTextContent('news@bi.org · Last in Oct 27')
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('The shul it’s from'), 'Beth Israel')
    await user.click(screen.getByRole('button', { name: 'Link' }))
    await user.click(screen.getByRole('button', { name: 'Not a shul' }))
    expect(posts).toEqual([
      { action: 'link', id: 'n', resourceId: 'shul-1' },
      { action: 'ignore', id: 'n' },
    ])
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
