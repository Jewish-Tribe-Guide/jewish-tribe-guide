// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson } from '@/lib/fetchJson'
import NewslettersPage, { type NewslettersLoaded } from './NewslettersPage'

// The shuls' and eruvs' emails (admin drawings 18 and 18b, Oct 29): the
// emails the Gmail script reads, each with its place. Setting the script up
// is on the Community email page (CommunityEmailPage.test.tsx, Nov 25).

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
  it('adds a newsletter with its shul', async () => {
    show(loaded())
    expect(await screen.findByText('None yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Community email/ })).toHaveAttribute('href', '/test-community/admin/team/email')
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
          { watchId: 'a', email: 'news@bi.org', shul: 'Beth Israel', status: 'Last in Oct 27', bad: false, page: 'place/shul-1' },
        ],
      }),
    )
    const row = await screen.findByRole('link', { name: /Beth Israel/ })
    expect(row).toHaveAttribute('href', '/test-community/admin/watches/place/shul-1?from=job/newsletters')
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
