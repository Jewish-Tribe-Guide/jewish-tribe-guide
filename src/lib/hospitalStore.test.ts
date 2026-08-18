import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  cacheTag: () => {},
  cacheLife: () => {},
}))

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    order: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const { listHospitals, hospitalNameMap } = await import('./hospitalStore')

afterEach(() => {
  mockFrom.mockReset()
})

describe('listHospitals', () => {
  it('maps rows, ordering by sort_order then name', async () => {
    const builder = chainable({
      data: [{ id: 'h1', name: 'General', latitude: 1, longitude: 2, timezone: 'America/New_York', info: null }],
      error: null,
    })
    mockFrom.mockReturnValue(builder)

    const [hospital] = await listHospitals('philly')

    expect(hospital).toEqual({
      id: 'h1',
      name: 'General',
      latitude: 1,
      longitude: 2,
      timezone: 'America/New_York',
      info: undefined,
    })
    expect(builder.order).toHaveBeenCalledWith('sort_order', { ascending: true })
    expect(builder.order).toHaveBeenCalledWith('name', { ascending: true })
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(listHospitals('philly')).rejects.toThrow('Failed to load hospitals: boom')
  })
})

describe('hospitalNameMap', () => {
  it('builds an id → name map', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          { id: 'h1', name: 'General', latitude: 0, longitude: 0, timezone: 'UTC', info: null },
          { id: 'h2', name: 'Memorial', latitude: 0, longitude: 0, timezone: 'UTC', info: null },
        ],
        error: null,
      }),
    )
    expect(await hospitalNameMap('philly')).toEqual({ h1: 'General', h2: 'Memorial' })
  })

  it('falls back to an empty map rather than throwing when the table read fails', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    expect(await hospitalNameMap('philly')).toEqual({})
  })
})
