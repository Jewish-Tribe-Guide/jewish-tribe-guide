// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryEditor } from './CategoryEditor'
import { forgetReadyMade } from './useReadyMade'
import { renderWithProviders } from '@/test/renderWithProviders'
import { historyRouter } from '@/test/nextNavigationMock'
import { fetchJson } from '@/lib/fetchJson'
import type { CategoryConfig } from '@/lib/categories'
import real from './__fixtures__/realCategories.json'

// The user, Nov 10: "the save/undo in admin is really sensitive. Like even
// just clicking something triggers a change. And undoing something still
// says a change happened." A press that changes nothing, or a change put
// back by hand, is no change: the Save bar stays away. Swept over real pages
// (a copy of the dev site's Food, Mikvah, Hospital, Synagogue, Grocery and
// Hotel), every field's screen and every switch on it, so a switch added
// later is covered without anyone remembering to.

vi.mock('@/lib/fetchJson', async (original) => ({ ...(await original<typeof import('@/lib/fetchJson')>()), fetchJson: vi.fn() }))
vi.mock('./CategoryPreview', () => ({ default: () => null }))
vi.mock('./AdminAuthGate', async (original) => ({ ...(await original<typeof import('./AdminAuthGate')>()), useIsSuperAdmin: () => true }))
vi.mock('next/navigation', () => ({
  useRouter: () => historyRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

const pages = real as unknown as CategoryConfig[]

beforeEach(() => {
  vi.mocked(fetchJson).mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  forgetReadyMade()
  history.replaceState(null, '', '/')
})

const open = (page: CategoryConfig) =>
  renderWithProviders(<CategoryEditor token="t" initial={page} siblings={null} onSaved={vi.fn()} onCancel={vi.fn()} />)

/** What the Save bar says, or null when it's away. */
const bar = () => screen.queryByRole('region', { name: 'Save' })?.querySelector('[role=status]')?.textContent ?? null

const fieldRows = () => [...document.querySelectorAll('button [data-row-name]')].map((e) => e.textContent!)

describe('a press that changes nothing is no change', () => {
  for (const page of pages) {
    it(`${page.label}: every switch on every field's screen, on and back off`, async () => {
      const user = userEvent.setup()
      open(page)
      const names = fieldRows()
      expect(names.length).toBeGreaterThan(0)
      const left: string[] = []
      for (const [i, name] of names.entries()) {
        if (i > 0) {
          cleanup()
          history.replaceState(null, '', '/')
          open(page)
        }
        await user.click([...document.querySelectorAll('button')].find((b) => b.querySelector('[data-row-name]')?.textContent === name)!)
        // By place: a screen can show a switch's name twice (Hours' days).
        const count = screen.queryAllByRole('switch').length
        for (let s = 0; s < count; s++) {
          const sw = () => (screen.queryAllByRole('switch').length === count ? screen.queryAllByRole('switch')[s] : undefined)
          if (!sw()) continue
          const label = sw()!.getAttribute('aria-label')
          await user.click(sw()!)
          if (!sw()) continue // it opened a step of its own
          await user.click(sw()!)
          if (bar()) left.push(`${name} › ${label}: ${bar()}`)
          if (bar()) await user.click(screen.getByRole('button', { name: 'Undo' }))
        }
      }
      expect(left).toEqual([])
    }, 60_000)

    it(`${page.label}: a box's name pressed and left as it was`, async () => {
      const user = userEvent.setup()
      open(page)
      const left: string[] = []
      for (const label of screen.queryAllByRole('button', { name: /^Rename / }).map((b) => b.getAttribute('aria-label')!)) {
        const b = screen.queryByRole('button', { name: label })
        if (!b) continue
        await user.click(b)
        await user.keyboard('{Enter}')
        if (bar()) left.push(`${label}: ${bar()}`)
        if (bar()) await user.click(screen.getByRole('button', { name: 'Undo' }))
      }
      expect(left).toEqual([])
    })
  }
})
