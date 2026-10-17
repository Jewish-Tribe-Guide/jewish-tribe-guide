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
