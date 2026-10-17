import { describe, expect, it, vi } from 'vitest'
import type { DirectoryResource } from '@/types'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { ORS_SPACING_MS, workOutWalks, type WalkRouteDeps } from './walkRouteRun'
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
