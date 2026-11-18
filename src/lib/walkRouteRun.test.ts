import { describe, expect, it, vi } from 'vitest'
import type { DirectoryResource } from '@/types'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { ORS_SPACING_MS, askOpenRouteService, inTurn, workOutWalks, type WalkRouteDeps } from './walkRouteRun'
import type { WalkRoute } from './walkRoutes'

const at = { lat: 39.95, lng: -75.16 }
const milesNorth = (miles: number) => ({ lat: at.lat + miles / 69.05, lng: at.lng })
const hotels = makeCategory({ id: 'hotel', walkList: { categoryId: 'synagogue', maxMinutes: 30 } })
const shuls = makeCategory({ id: 'synagogue' })
const place = (id: string, category: string, geo?: { lat: number; lng: number }) => makeListing({ id, category, name: id, geo }) as DirectoryResource

const listings: Record<string, DirectoryResource[]> = {
  hotel: [place('h1', 'hotel', at), place('h2', 'hotel', milesNorth(0.2)), place('h3', 'hotel')],
  synagogue: [place('s1', 'synagogue', milesNorth(0.5)), place('s2', 'synagogue', milesNorth(1)), place('far', 'synagogue', milesNorth(5))],
}
// What ORS would answer: two minutes a walk, 100 m each.
const reply = (body: { destinations: number[] }) => ({ durations: [body.destinations.map(() => 120)], distances: [body.destinations.map(() => 100)] })

function deps(over: Partial<WalkRouteDeps> = {}): WalkRouteDeps & { saved: Record<string, string[]> } {
  const saved: Record<string, string[]> = {}
  return {
    categories: [hotels, shuls],
    listings: async (id) => listings[id] ?? [],
    stored: new Map(),
    save: async (fromId, walks) => {
      saved[fromId] = [...(saved[fromId] ?? []), ...walks.map((w) => `${w.toId}:${w.minutes}`)]
    },
    ask: vi.fn(async (body) => reply(body)),
    wait: vi.fn(async () => {}),
    budget: 20,
    saved,
    ...over,
  }
}

describe('workOutWalks', () => {
  it('asks once a listing with a location, for the places in reach, and keeps them', async () => {
    const d = deps()
    const result = await workOutWalks(d)
    expect(d.saved).toEqual({ h1: ['s1:2', 's2:2'], h2: ['s1:2', 's2:2'] })
    expect(result).toEqual({ listings: 2, asked: 2, walks: 4, failed: 0, leftForTomorrow: 0 })
    // Spaced out, under ORS's 40 a minute.
    expect(d.wait).toHaveBeenCalledTimes(1)
    expect(d.wait).toHaveBeenCalledWith(ORS_SPACING_MS)
  })

  it('asks nothing for walks already kept, where nothing has moved', async () => {
    const kept = (to: { lat: number; lng: number }): WalkRoute => ({ from: at, to, minutes: 9, meters: 700 })
    const stored = new Map([['h1', new Map([['s1', kept(milesNorth(0.5))], ['s2', kept(milesNorth(1))]])]])
    const d = deps({ stored })
    await workOutWalks(d)
    expect(d.saved).toEqual({ h2: ['s1:2', 's2:2'] })
  })

  it('stops at its budget and leaves the rest for tomorrow', async () => {
    const d = deps({ budget: 1 })
    expect(await workOutWalks(d)).toMatchObject({ asked: 1, walks: 2, leftForTomorrow: 2 })
  })

  // Nov 18 review: a request that fails every night (a place
  // OpenRouteService can't route to) was first in line every night, and
  // with enough of them the budget never reached the rest.
  it('starts at a different request each night, so one that keeps failing isn’t always first', async () => {
    const asked = async (turn: number) => {
      const d = deps({ budget: 1, turn })
      await workOutWalks(d)
      return Object.keys(d.saved)
    }
    expect(await asked(0)).toEqual(['h1'])
    expect(await asked(1)).toEqual(['h2'])
    expect(await asked(2)).toEqual(['h1'])
  })

  it('keeps nothing for a listing whose request fails, and carries on', async () => {
    const ask = vi.fn(async (body) => reply(body))
    ask.mockRejectedValueOnce(new Error('OpenRouteService 429'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps({ ask })
    expect(await workOutWalks(d)).toMatchObject({ asked: 2, walks: 2, failed: 2 })
    expect(d.saved).toEqual({ h2: ['s1:2', 's2:2'] })
    error.mockRestore()
  })

  it('does nothing for a category with no walk list, or one listing a category that’s gone', async () => {
    const d = deps({ categories: [{ ...hotels, walkList: { categoryId: 'gone', maxMinutes: 30 } }, shuls] })
    expect(await workOutWalks(d)).toMatchObject({ listings: 0, asked: 0 })
  })
})

// Nov 18 review: the request had no timeout inside the job's 60s limit, so
// one that never answered ran the job into Vercel's cutoff.
describe('askOpenRouteService', () => {
  it('gives up rather than waiting for an answer that never comes', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    try {
      await askOpenRouteService('k', { locations: [], sources: [], destinations: [], metrics: ['duration'] } as never)
      expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('inTurn', () => {
  it('starts at the turn’s place and goes round, whatever the turn', () => {
    expect(inTurn(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c'])
    expect(inTurn(['a', 'b', 'c'], 4)).toEqual(['b', 'c', 'a'])
    expect(inTurn(['a', 'b', 'c'], -1)).toEqual(['c', 'a', 'b'])
    expect(inTurn([], 3)).toEqual([])
  })
})
