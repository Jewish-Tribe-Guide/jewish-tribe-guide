// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockRouter } from '@/test/nextNavigationMock'
import type { Eruv } from '@/lib/eruv'
import EruvEditor from './EruvEditor'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/eruv',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(cleanup)

const eruv: Eruv = {
  id: 'center-city', name: 'Center City Eruv', covers: 'Center City.', website: null, hotline: null, alertsUrl: null, statusUrl: null, statusDated: false,
  status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null,
}

// The desktop map asks "Discard your changes?" before a search or a pin
// takes the editor's place, and only if something's been typed (Oct 15).
describe('EruvEditor — onHasChanges', () => {
  it('says whether anything typed differs from the eruv as it is', async () => {
    const user = userEvent.setup()
    const onHasChanges = vi.fn()
    renderWithProviders(<EruvEditor eruv={eruv} onClose={() => {}} onHasChanges={onHasChanges} />)
    expect(onHasChanges).toHaveBeenLastCalledWith(false)

    const hotline = screen.getByLabelText(/hotline/i)
    await user.type(hotline, '215')
    expect(onHasChanges).toHaveBeenLastCalledWith(true)

    await user.clear(hotline)
    expect(onHasChanges).toHaveBeenLastCalledWith(false)
  })
})

// Nov 9: it follows the Eruv page's Fields (eruvFields.ts): a row taken off
// the page isn't here, and a field made on it is, sent in `details`.
describe('EruvEditor — the Eruv page’s fields', () => {
  const page = {
    id: 'eruv-information', label: 'Eruv', pluralLabel: 'Eruv', icon: '', description: '', kind: 'eruv' as const,
    detailFields: [{ key: 'hotline', label: 'Hotline', type: 'tel' as const }, { key: 'certifiedBy', label: 'Certified by', type: 'text' as const }],
  }

  it('has the page’s rows only, in its order, and sends a made field’s value in details', async () => {
    const sent: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ ok: true, id: 's1' }))
    }))
    const user = userEvent.setup()
    renderWithProviders(<EruvEditor eruv={{ ...eruv, details: { certifiedBy: 'Rabbi A' } }} page={page} onClose={() => {}} />)
    const labels = screen.getAllByText(/^(Where it goes|Website|Hotline|Email alerts|Certified by)$/).map((l) => l.textContent)
    expect(labels).toEqual(['Hotline', 'Certified by'])
    expect(screen.getByLabelText('Certified by')).toHaveValue('Rabbi A')
    await user.clear(screen.getByLabelText('Certified by'))
    await user.type(screen.getByLabelText('Certified by'), 'Rabbi B')
    await user.click(screen.getByRole('button', { name: /Send/ }))
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ targetType: 'eruv', payload: { covers: 'Center City.', hotline: '', details: { certifiedBy: 'Rabbi B' } } })
    vi.unstubAllGlobals()
  })
})
