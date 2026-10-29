// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchJson } from '@/lib/fetchJson'
import type { StaticPage } from '@/lib/pagesStore'
import PagesEditor from './PagesEditor'

vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn() }))

const year = new Date().getFullYear()
const pages: StaticPage[] = [
  { slug: 'about', title: 'About', body: '<p>Who we are.</p>', updatedAt: new Date(year, 7, 28, 12).toISOString() },
  { slug: 'privacy', title: 'Privacy Policy and Terms of Use', body: '<p>What we keep.</p>', updatedAt: new Date(year, 8, 3, 12).toISOString() },
]

function renderPages() {
  vi.mocked(fetchJson).mockImplementation(async (url, init) => {
    if (init?.method === 'PATCH') {
      const sent = JSON.parse(String(init.body)) as { title: string; body: string }
      return { page: { ...pages[0], ...sent } }
    }
    return { pages }
  })
  render(<PagesEditor token="tok" />)
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('About and Privacy', () => {
  it('says there is one copy, switches between the pages, and says when each was updated', async () => {
    const user = userEvent.setup()
    renderPages()
    expect(await screen.findByText('One copy for every community')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'About' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Updated Aug 28')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Privacy Policy and Terms of Use' }))
    expect(screen.getByLabelText('Title')).toHaveValue('Privacy Policy and Terms of Use')
    expect(screen.getByText('Updated Sep 3')).toBeInTheDocument()
  })

  it('saves through one bar: a count, Undo, Save, then Saved.', async () => {
    const user = userEvent.setup()
    renderPages()
    const title = await screen.findByLabelText('Title')
    expect(screen.queryByRole('region', { name: 'Save' })).toBeNull()
    await user.type(title, ' us')
    expect(screen.getByRole('status')).toHaveTextContent('1 change')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(title).toHaveValue('About')
    expect(screen.queryByRole('region', { name: 'Save' })).toBeNull()

    await user.type(title, ' us')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved.'))
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/pages/about',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ title: 'About us', body: '<p>Who we are.</p>' }) }),
      'Save failed.',
    )
  })

  it('asks before switching pages with changes', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPages()
    await user.type(await screen.findByLabelText('Title'), ' us')
    await user.click(screen.getByRole('button', { name: 'Privacy Policy and Terms of Use' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Title')).toHaveValue('About us')
  })
})
