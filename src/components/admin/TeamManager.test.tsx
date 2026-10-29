// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import TeamManager from './TeamManager'

// Settings' Team tab: one list, added to and removed from here, never
// yourself; and your own two emails, as switches.

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/ues/admin/team',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

function mockList(adminEmails: string[], myNotify = true, myReviewNotify = false) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response))
  vi.mocked(parseOkJson).mockResolvedValue({ adminEmails, myNotify, myReviewNotify })
}

async function renderAndWaitForList(adminEmails: string[] = ['jane@example.com'], myNotify = true, myReviewNotify = false) {
  mockList(adminEmails, myNotify, myReviewNotify)
  const view = renderWithProviders(<TeamManager token="tok" me="me@example.com" />, { community: { slug: 'ues' } })
  await waitFor(() => expect(screen.queryByText('Loading team…')).toBeNull())
  return view
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('TeamManager', () => {
  it('lists every admin, with You on your own row instead of Remove', async () => {
    await renderAndWaitForList(['Me@Example.com', 'sam@example.com'])

    const rows = screen.getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual(['Me@Example.comYou', 'sam@example.comRemove'])
    expect(screen.queryByRole('button', { name: 'Remove Me@Example.com' })).toBeNull()
  })

  it('scopes the GET to the active community', async () => {
    await renderAndWaitForList()

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      '/api/admin/team?community=ues',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    )
  })

  it('disables Add admin until something is typed', async () => {
    await renderAndWaitForList()

    expect(screen.getByRole('button', { name: 'Add admin' })).toBeDisabled()
  })

  it('POSTs the typed email, scoped to the active community, and adds it to the list', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList(['jane@example.com'])
    vi.mocked(fetchJson).mockResolvedValueOnce({ adminEmails: ['jane@example.com', 'sam@example.com'] })

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'sam@example.com')
    await user.click(screen.getByRole('button', { name: 'Add admin' }))

    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
    const call = vi.mocked(fetchJson).mock.calls[0]!
    expect(call[0]).toBe('/api/admin/team?community=ues')
    const init = call[1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'sam@example.com' })

    expect(await screen.findByText('sam@example.com')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('')
  })

  it('shows a server-side error and leaves the typed email in place', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('A valid email is required.'))
    const user = userEvent.setup()
    await renderAndWaitForList()

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Add admin' }))

    expect(await screen.findByText('A valid email is required.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('not-an-email')
  })

  it('removes someone after asking, with DELETE, and Leave it keeps them', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList(['me@example.com', 'sam@example.com'])

    await user.click(screen.getByRole('button', { name: 'Remove sam@example.com' }))
    expect(screen.getByText('Remove sam@example.com?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave it' }))
    expect(fetchJson).not.toHaveBeenCalled()
    expect(screen.getByText('sam@example.com')).toBeInTheDocument()

    vi.mocked(fetchJson).mockResolvedValueOnce({ adminEmails: ['me@example.com'] })
    await user.click(screen.getByRole('button', { name: 'Remove sam@example.com' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByText('sam@example.com')).toBeNull())
    const init = vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit
    expect(vi.mocked(fetchJson).mock.calls[0]![0]).toBe('/api/admin/team?community=ues')
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'sam@example.com' })
  })

  it('shows an error when the initial load fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response))
    vi.mocked(parseOkJson).mockRejectedValue(new Error('Failed to load the team list.'))
    renderWithProviders(<TeamManager token="tok" me="me@example.com" />, { community: { slug: 'ues' } })

    expect(await screen.findByText('Failed to load the team list.')).toBeInTheDocument()
  })

  // Only the signed-in admin's own: on by default for something new to
  // decide, off for another admin's decisions (see the notify_review_emails
  // migration's comment). Saved as soon as it's switched, put back on a
  // failure.
  describe.each([
    ['Something new to decide', 'notify', 'Another admin decided something'],
    ['Another admin decided something', 'reviewNotify', 'Something new to decide'],
  ] as const)('the %s switch', (label, field, other) => {
    const on = (field === 'notify') as boolean

    it('shows the value it loaded with', async () => {
      await renderAndWaitForList(['jane@example.com'], true, false)
      expect(screen.getByRole('switch', { name: label })).toHaveAttribute('aria-checked', String(on))
    })

    it('PATCHes only itself, scoped to the active community', async () => {
      const user = userEvent.setup()
      await renderAndWaitForList(['jane@example.com'], true, false)
      vi.mocked(fetchJson).mockResolvedValueOnce({})

      await user.click(screen.getByRole('switch', { name: label }))

      await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
      const call = vi.mocked(fetchJson).mock.calls[0]!
      expect(call[0]).toBe('/api/admin/team?community=ues')
      expect((call[1] as RequestInit).method).toBe('PATCH')
      expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({ [field]: !on })
      expect(screen.getByRole('switch', { name: label })).toHaveAttribute('aria-checked', String(!on))
      expect(screen.getByRole('switch', { name: other })).toHaveAttribute('aria-checked', String(!on))
    })

    it('goes back and says so when the save fails', async () => {
      const user = userEvent.setup()
      await renderAndWaitForList(['jane@example.com'], true, false)
      vi.mocked(fetchJson).mockRejectedValueOnce(new Error('Could not update your notification preference.'))

      await user.click(screen.getByRole('switch', { name: label }))

      expect(await screen.findByText('Could not update your notification preference.')).toBeInTheDocument()
      expect(screen.getByRole('switch', { name: label })).toHaveAttribute('aria-checked', String(on))
    })
  })
})
