// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import TeamManager from './TeamManager'

// Add-only by design — see this component's own comment. There is
// deliberately no "remove" affordance and no test for one; removing an
// admin is a superadmin-only action from CommunityManager instead.

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/ues/admin/team',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))

function mockList(adminEmails: string[], myNotify = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response))
  vi.mocked(parseOkJson).mockResolvedValue({ adminEmails, myNotify })
}

async function renderAndWaitForList(adminEmails: string[] = ['jane@example.com'], myNotify = true) {
  mockList(adminEmails, myNotify)
  const view = renderWithProviders(<TeamManager token="tok" />, { community: { slug: 'ues' } })
  await screen.findByText('Team')
  return view
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('TeamManager', () => {
  it('lists every configured admin email', async () => {
    await renderAndWaitForList(['jane@example.com', 'sam@example.com'])

    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByText('sam@example.com')).toBeInTheDocument()
  })

  it('scopes the GET to the active community', async () => {
    await renderAndWaitForList()

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      '/api/admin/team?community=ues',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    )
  })

  it('shows a fallback message when nobody has been added yet', async () => {
    await renderAndWaitForList([])

    expect(screen.getByText(/falls back to the site owner/i)).toBeInTheDocument()
  })

  it('disables Add until something is typed', async () => {
    await renderAndWaitForList()

    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled()
  })

  it('POSTs the typed email, scoped to the active community, and adds it to the list', async () => {
    const user = userEvent.setup()
    await renderAndWaitForList(['jane@example.com'])
    vi.mocked(fetchJson).mockResolvedValueOnce({ adminEmails: ['jane@example.com', 'sam@example.com'] })

    await user.type(screen.getByPlaceholderText(/teammate@example.com/i), 'sam@example.com')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
    const call = vi.mocked(fetchJson).mock.calls[0]!
    expect(call[0]).toBe('/api/admin/team?community=ues')
    const init = call[1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'sam@example.com' })

    expect(await screen.findByText('sam@example.com')).toBeInTheDocument()
    // The input clears after a successful add.
    expect(screen.getByPlaceholderText(/teammate@example.com/i)).toHaveValue('')
  })

  it('shows a server-side error inline and leaves the typed email in place', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('A valid email is required.'))
    const user = userEvent.setup()
    await renderAndWaitForList()

    await user.type(screen.getByPlaceholderText(/teammate@example.com/i), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findByText('A valid email is required.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/teammate@example.com/i)).toHaveValue('not-an-email')
  })

  it('shows an error inline when the initial load fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response))
    vi.mocked(parseOkJson).mockRejectedValue(new Error('Failed to load the team list.'))
    renderWithProviders(<TeamManager token="tok" />, { community: { slug: 'ues' } })

    expect(await screen.findByText('Failed to load the team list.')).toBeInTheDocument()
  })

  describe('notification checkbox', () => {
    it('reflects the signed-in admin\'s own myNotify value from the load', async () => {
      await renderAndWaitForList(['jane@example.com'], true)
      expect(screen.getByRole('checkbox', { name: /email me about new submissions/i })).toBeChecked()

      cleanup()
      await renderAndWaitForList(['jane@example.com'], false)
      expect(screen.getByRole('checkbox', { name: /email me about new submissions/i })).not.toBeChecked()
    })

    it('unchecking it PATCHes { notify: false } scoped to the active community', async () => {
      const user = userEvent.setup()
      await renderAndWaitForList(['jane@example.com'], true)
      vi.mocked(fetchJson).mockResolvedValueOnce({ myNotify: false })

      await user.click(screen.getByRole('checkbox', { name: /email me about new submissions/i }))

      await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1))
      const call = vi.mocked(fetchJson).mock.calls[0]!
      expect(call[0]).toBe('/api/admin/team?community=ues')
      const init = call[1] as RequestInit
      expect(init.method).toBe('PATCH')
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
      expect(JSON.parse(init.body as string)).toEqual({ notify: false })
      expect(screen.getByRole('checkbox', { name: /email me about new submissions/i })).not.toBeChecked()
    })

    it('reverts the checkbox and shows an error when the PATCH fails', async () => {
      const user = userEvent.setup()
      await renderAndWaitForList(['jane@example.com'], true)
      vi.mocked(fetchJson).mockRejectedValueOnce(new Error('Could not update your notification preference.'))

      await user.click(screen.getByRole('checkbox', { name: /email me about new submissions/i }))

      expect(await screen.findByText('Could not update your notification preference.')).toBeInTheDocument()
      // Reverted, not left on the optimistic (unchecked) value.
      expect(screen.getByRole('checkbox', { name: /email me about new submissions/i })).toBeChecked()
    })
  })
})
