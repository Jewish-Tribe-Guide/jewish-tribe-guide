// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeListing } from '@/test/providerFixtures'
import { FOOD } from '@/test/editorFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import TodoBroken from './TodoBroken'
import type { Jobs } from './useWatchJobs'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const jobs = (over: Partial<Jobs> = {}): Jobs => ({
  google: { places: [] } as never,
  dishes: null, hospitals: null, hours: null, times: null, sites: null, eruvim: null, kosher: null, links: null,
  ...over,
})

const pizza = makeListing({ id: 'p', category: 'restaurant', name: '20th Street Pizza', website: 'https://20thstreetpizza.com', dishes: ['Plain slice'] })

function serve() {
  const sent: { url: string; body: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' || init?.method === 'PATCH') sent.push({ url, body: JSON.parse(String(init.body)) })
      const body = url.includes('watches/google?item=') ? { ok: true, item: pizza, category: FOOD } : { ok: true }
      return new Response(JSON.stringify(body), { status: 200 })
    }),
  )
  return sent
}

function renderBroken(reload = vi.fn(async () => {})) {
  const dishes = [{ id: 'p', name: '20th Street Pizza', dishes: [], website: 'https://20thstreetpizza.com', menuUrl: 'https://20thstreetpizza.com/menu', reading: { status: 'failed', readAt: '2026-11-03T07:00:00Z', dishes: [] } }]
  renderWithProviders(
    <TodoBroken placeId="p" name="20th Street Pizza" label="Menu can’t be read" jobs={jobs({ dishes: dishes as never })} token="tok" community="philly" position={{ at: 1, total: 1, back: () => {} }} switches={null} reload={reload} />,
  )
  return reload
}

// The user, Nov 4 (note 5): "20th street pizza menu couldn't be read so I
// tried to add manually but couldn't find where to submit in to do". The
// dishes typed in only went out with another answer.
describe('a menu that can’t be read, its dishes typed in', () => {
  it('has Save these dishes once there’s a change, and it saves them as the menu’s', async () => {
    const sent = serve()
    const reload = renderBroken()
    const u = userEvent.setup()
    const editor = await screen.findByTestId('items-editor')
    expect(screen.queryByRole('button', { name: 'Save these dishes' })).not.toBeInTheDocument()
    await u.type(within(editor).getByRole('textbox'), 'Margherita{Enter}')
    await u.click(screen.getByRole('button', { name: 'Save these dishes' }))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    // Through the menu's own save: a failed reading so answered leaves To do.
    expect(sent).toEqual([{ url: expect.stringContaining('/api/admin/main-dishes'), body: { action: 'save', resourceId: 'p', always: ['Plain slice', 'Margherita'], sometimes: [] } }])
  })

  it('shows no Save these dishes with nothing typed', async () => {
    serve()
    renderBroken()
    await screen.findByTestId('items-editor')
    expect(screen.getByRole('button', { name: 'Give its menu' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save these dishes' })).not.toBeInTheDocument()
  })
})
