// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import { mockRouter } from '@/test/nextNavigationMock'
import { renderWithProviders } from '@/test/renderWithProviders'
import ResponsesManager from './ResponsesManager'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/responses',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function show(forms: { id: string; title: string }[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes('/api/admin/forms') ? { ok: true, forms } : { ok: true, responses: [] }))))
  renderWithProviders(<ResponsesManager token="t" />)
}

describe('ResponsesManager', () => {
  it('is simply the feedback, with nothing about the inbox', async () => {
    show([{ id: 'support', title: 'Support' }, { id: 'volunteer', title: 'Volunteer' }])
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/inbox/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Feedback' })).toBeNull()
  })

  it('has tabs once a published form has its own responses', async () => {
    show([{ id: 'dinner', title: 'Dinner sign-up' }])
    expect(await screen.findByRole('button', { name: 'Dinner sign-up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Feedback' })).toBeInTheDocument()
  })
})
