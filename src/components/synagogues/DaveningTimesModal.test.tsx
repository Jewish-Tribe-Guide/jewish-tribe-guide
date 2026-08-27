// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeListing } from '@/test/providerFixtures'
import type { Minyan } from '@/lib/davening'
import { formatAnchorRule } from '@/lib/davening'
import type { ZmanimData } from '@/types'
import DaveningTimesModal from './DaveningTimesModal'

afterEach(() => cleanup())

function clockMinyan(overrides: Partial<Minyan> = {}): Minyan {
  return { id: 'm1', tefillah: 'shacharis', days: ['sun'], time: '7:00am', ...overrides }
}

// A row anchored to a zman rather than a fixed clock time — `time` mirrors
// what the intake form auto-generates via formatAnchorRule, same as real data.
function anchorMinyan(overrides: Partial<Minyan> = {}): Minyan {
  return {
    id: 'm2',
    tefillah: 'mincha',
    days: ['fri'],
    time: formatAnchorRule('sunset', -18),
    anchor: 'sunset',
    offsetMinutes: -18,
    ...overrides,
  }
}

const noop = () => {}

// useZmanAnchors hits a real `/api/zmanim` — this is the shape it expects
// back, with just enough for resolveAnchorTime to produce a calculated time
// for a sunset-anchored row.
const ZMANIM_RESPONSE: { ok: true; data: ZmanimData } = {
  ok: true,
  data: {
    hebrewDate: '1 Nisan 5786',
    dayOfWeek: 5,
    isFriday: true,
    isShabbos: false,
    dailyZmanim: [{ label: 'Sunset', time: '7:30 PM', iso: '2026-08-28T23:30:00.000Z' }],
    shabbos: { candleLighting: null, havdalah: null },
  },
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ZMANIM_RESPONSE }) as unknown as Response),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DaveningTimesModal', () => {
  it('renders nothing when closed', () => {
    const listing = makeListing({ minyanim: [clockMinyan()] })
    const { container } = render(
      <DaveningTimesModal items={[listing]} isOpen={false} onClose={noop} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the empty state when no listing has structured minyanim', () => {
    const listing = makeListing({ name: 'Plain Listing' })
    render(<DaveningTimesModal items={[listing]} isOpen onClose={noop} />)
    expect(screen.getByText('No structured davening data available yet.')).toBeInTheDocument()
  })

  it('groups a shul’s minyanim by day and tefillah', () => {
    const listing = makeListing({
      name: 'Test Shul',
      minyanim: [clockMinyan({ days: ['sun'], time: '7:00am' })],
    })
    render(<DaveningTimesModal items={[listing]} isOpen onClose={noop} />)

    expect(screen.getByText('Sunday')).toBeInTheDocument()
    expect(screen.getByText('Shacharis')).toBeInTheDocument()
    expect(screen.getByText('Test Shul')).toBeInTheDocument()
    expect(screen.getByText('7:00am')).toBeInTheDocument()
  })

  it('filters by day using the day pills, and shows a no-match message', async () => {
    const user = userEvent.setup()
    const listing = makeListing({ name: 'Sunday Shul', minyanim: [clockMinyan({ days: ['sun'] })] })
    render(<DaveningTimesModal items={[listing]} isOpen onClose={noop} />)

    await user.click(screen.getByRole('button', { name: 'Mon' }))

    expect(screen.getByText('No davening times on Mon.')).toBeInTheDocument()
    expect(screen.queryByText('Sunday Shul')).not.toBeInTheDocument()
  })

  it('filters by denomination when more than one is present', async () => {
    const user = userEvent.setup()
    const orthodox = makeListing({
      id: 'o1',
      name: 'Orthodox Shul',
      denomination: 'Orthodox',
      minyanim: [clockMinyan()],
    })
    const reform = makeListing({
      id: 'r1',
      name: 'Reform Temple',
      denomination: 'Reform',
      minyanim: [clockMinyan()],
    })
    render(<DaveningTimesModal items={[orthodox, reform]} isOpen onClose={noop} />)

    expect(screen.getByText('Orthodox Shul')).toBeInTheDocument()
    expect(screen.getByText('Reform Temple')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All Denominations' }))
    await user.click(screen.getByRole('button', { name: 'Orthodox' }))

    expect(screen.getByText('Orthodox Shul')).toBeInTheDocument()
    expect(screen.queryByText('Reform Temple')).not.toBeInTheDocument()
  })

  it('expanding a row without a set location offers to set one instead of a distance', async () => {
    const user = userEvent.setup()
    const listing = makeListing({ name: 'Test Shul', minyanim: [clockMinyan()] })
    render(<DaveningTimesModal items={[listing]} isOpen onClose={noop} />)

    await user.click(screen.getByText('Test Shul'))

    expect(screen.getByText('Set your location to see distance')).toBeInTheDocument()
  })

  it('calls onClose from the close button and the Escape key', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const listing = makeListing({ minyanim: [clockMinyan()] })
    render(<DaveningTimesModal items={[listing]} isOpen onClose={onClose} />)

    await user.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows no calculated-time disclaimer when every row is a plain clock time', () => {
    const listing = makeListing({ minyanim: [clockMinyan()] })
    render(<DaveningTimesModal items={[listing]} isOpen onClose={noop} />)

    expect(screen.queryByText(/are calculated from today/)).not.toBeInTheDocument()
  })

  it('shows the calculated-time disclaimer, with a working ≈ time, once zmanim resolve', async () => {
    const listing = makeListing({
      name: 'Sunset Shul',
      geo: { lat: 40.001, lng: -75.001 },
      minyanim: [anchorMinyan()],
    })
    render(<DaveningTimesModal items={[listing]} isOpen onClose={noop} />)

    expect(await screen.findByText(/are calculated from today/)).toBeInTheDocument()
    // The resolved clock time (7:30 PM sunset, 18 min before → 7:12 PM),
    // formatted by the same formatTime the component's own zmanim path uses.
    expect(screen.getByText('≈ 18 min before Sunset')).toBeInTheDocument()
  })

  it('dismissing the disclaimer hides it and persists across a remount', async () => {
    const user = userEvent.setup()
    const listing = makeListing({
      name: 'Sunset Shul',
      geo: { lat: 40.002, lng: -75.002 },
      minyanim: [anchorMinyan()],
    })
    const { unmount } = render(<DaveningTimesModal items={[listing]} isOpen onClose={noop} />)

    await screen.findByText(/are calculated from today/)
    await user.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText(/are calculated from today/)).not.toBeInTheDocument()

    // The modal fully unmounts on close in the real app (`if (!isOpen) return
    // null`) — a fresh mount is the realistic "reopen" simulation, not a rerender.
    unmount()
    render(<DaveningTimesModal items={[listing]} isOpen onClose={noop} />)

    await waitFor(() => {
      expect(screen.getByText('≈ 18 min before Sunset')).toBeInTheDocument()
    })
    expect(screen.queryByText(/are calculated from today/)).not.toBeInTheDocument()
  })

  it('never shows the disclaimer for a returning visitor who dismissed it in an earlier visit', async () => {
    localStorage.setItem('davening-calc-disclaimer-dismissed', '1')
    const listing = makeListing({
      name: 'Sunset Shul',
      geo: { lat: 40.003, lng: -75.003 },
      minyanim: [anchorMinyan()],
    })
    render(<DaveningTimesModal items={[listing]} isOpen onClose={noop} />)

    await waitFor(() => {
      expect(screen.getByText('≈ 18 min before Sunset')).toBeInTheDocument()
    })
    expect(screen.queryByText(/are calculated from today/)).not.toBeInTheDocument()
  })
})
