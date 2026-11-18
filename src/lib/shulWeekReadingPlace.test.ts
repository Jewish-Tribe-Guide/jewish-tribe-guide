import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryResource } from '@/types'

// readShulWeek with its reads mocked: what it asks for zmanim, and which
// days it hands the reader, for a community that isn't Philadelphia.
const m = vi.hoisted(() => ({ fetchDatesInfo: vi.fn(), readRegular: vi.fn() }))
vi.mock('./dateZmanim', () => ({ fetchDatesInfo: m.fetchDatesInfo }))
vi.mock('./scheduleReader', () => ({ readRegular: m.readRegular }))
vi.mock('./heldElsewhere', () => ({ leaveOutHeldElsewhere: async (times: unknown[]) => ({ times, left: [] }) }))

const { readShulWeek } = await import('./shulWeekReading')

const HONOLULU = { timezone: 'Pacific/Honolulu', mapCenter: { lat: 21.3, lng: -157.86 } }
const shul = { id: 's1', name: 'Shul', category: 'synagogues', minyanim: [] } as unknown as DirectoryResource

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  m.fetchDatesInfo.mockResolvedValue({ names: {}, zmanim: {} })
  m.readRegular.mockResolvedValue({ times: [], model: 'cheap' })
})

describe('readShulWeek: the community’s own place', () => {
  // Nov 18 review: every community's zmanim were worked out at Philly's
  // centre and its days counted on Philly's clock (community.config).
  it('works out zmanim at the community’s centre, in its timezone, for a shul with no pin', async () => {
    vi.setSystemTime(Date.parse('2026-10-20T15:00:00Z'))
    await readShulWeek(shul, 'minyanim', { text: 'Shacharis 7am' }, 'k', { where: HONOLULU })
    expect(m.fetchDatesInfo.mock.calls[0][0]).toEqual({ latitude: 21.3, longitude: -157.86, timezone: 'Pacific/Honolulu' })
  })

  it('starts the days on the community’s own today', async () => {
    // Monday 11pm in Honolulu is already Tuesday in Philadelphia.
    vi.setSystemTime(Date.parse('2026-10-20T09:00:00Z'))
    await readShulWeek(shul, 'minyanim', { text: 'Shacharis 7am' }, 'k', { where: HONOLULU })
    expect(m.readRegular.mock.calls[0][1]).toMatchObject({ today: '2026-10-19' })
  })
})
