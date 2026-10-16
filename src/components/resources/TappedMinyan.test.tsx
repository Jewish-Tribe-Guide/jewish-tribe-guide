// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import ListingView from './ListingView'
import { parseTappedMinyan, TappedMinyanContext, tappedMinyanParam } from './TappedMinyan'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/useZmanim', () => ({ useZmanim: () => ({ data: null, status: 'idle' }) }))

// Oct 16: a minyan tapped in Minyanim by time opens its place on that
// minyan, the way a search opens a listing on what it matched: the day and
// time, its note, and where to sign up for one that needs it, in one box.

afterEach(() => cleanup())
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-06T12:00:00-04:00')) // Tue, noon
})
afterEach(() => vi.useRealTimers())

const shuls = makeCategory({ id: 'synagogue', label: 'Synagogue', detailFields: [{ key: 'minyanim', label: 'Davening', type: 'minyanim', renderAs: 'row' }] })
const beth = makeListing({
  id: 'beth',
  name: 'Center City Beth Am',
  category: 'synagogue',
  minyanim: [
    { id: 'mi', tefillah: 'mincha', days: ['mon', 'tue', 'wed', 'thu'], time: '1:45pm', notes: 'In the small beis midrash' },
    { id: 'lm', tefillah: 'maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '9:45pm', signUp: { link: 'https://chat.whatsapp.com/Late1' } },
  ],
})
const open = (param: string | null) =>
  renderWithProviders(
    <TappedMinyanContext.Provider value={parseTappedMinyan(param, 'beth')}>
      <ListingView item={beth} category={shuls} color="#2657bf" path="/philly/synagogue/beth" foot={null} />
    </TappedMinyanContext.Provider>,
    { content: { categories: [shuls] } },
  )

describe('the minyan you tapped', () => {
  it('reads back what a row writes, and nothing else', () => {
    expect(parseTappedMinyan(tappedMinyanParam('mi', '2026-10-06', 13 * 60 + 45), 'beth')).toEqual({ itemId: 'beth', minyanId: 'mi', date: '2026-10-06', minutes: 825 })
    expect(parseTappedMinyan('mi~2026-10-06~9999', 'beth')).toBeNull()
    expect(parseTappedMinyan('mi', 'beth')).toBeNull()
    expect(parseTappedMinyan(tappedMinyanParam('mi', '2026-10-06', 825), null)).toBeNull()
  })

  it('opens the place on it: the day and time, and its note', () => {
    open(tappedMinyanParam('mi', '2026-10-06', 13 * 60 + 45))
    const box = screen.getByTestId('tapped-minyan')
    expect(box).toHaveTextContent('The minyan you tappedMincha · today 1:45 PMIn the small beis midrash')
    expect(within(box).queryByRole('link')).not.toBeInTheDocument()
  })

  it('a day ahead says which', () => {
    open(tappedMinyanParam('mi', '2026-10-08', 13 * 60 + 45))
    expect(screen.getByTestId('tapped-minyan')).toHaveTextContent('Mincha · Thursday 1:45 PM')
  })

  it('one that only runs when enough sign up: where to sign up, in the same box, not again under the times', () => {
    open(tappedMinyanParam('lm', '2026-10-06', 21 * 60 + 45))
    const box = screen.getByTestId('tapped-minyan')
    expect(box).toHaveTextContent('Maariv · today 9:45 PMCheck the group first: it only runs on days enough people sign up.')
    expect(within(box).getByRole('link', { name: 'Say you’re coming' })).toHaveAttribute('href', 'https://chat.whatsapp.com/Late1')
    expect(screen.queryByTestId('sign-up-box')).not.toBeInTheDocument()
  })

  it('opened any other way: no box, and the sign-up box under the times', () => {
    open(null)
    expect(screen.queryByTestId('tapped-minyan')).not.toBeInTheDocument()
    expect(screen.getByTestId('sign-up-box')).toHaveTextContent('Maariv 9:45 PM: check the group first')
  })
})
