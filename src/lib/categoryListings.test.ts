import { afterEach, describe, expect, it, vi } from 'vitest'
import { FRESH_MS, forgetCategoryListings, prefetchCategoryListings, takeCategoryListings } from './categoryListings'

const answer = (resources: unknown[]) => new Response(JSON.stringify({ ok: true, resources }))

afterEach(() => {
  forgetCategoryListings()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('categoryListings', () => {
  it('hands the answer already on its way to the first taker, and asks again for the next', async () => {
    const fetch = vi.fn(async () => answer([{ id: 'a' }]))
    vi.stubGlobal('fetch', fetch)
    prefetchCategoryListings('philly', 'restaurant')
    prefetchCategoryListings('philly', 'restaurant')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(await takeCategoryListings('philly', 'restaurant')).toEqual({ ok: true, resources: [{ id: 'a' }] })
    expect(fetch).toHaveBeenCalledTimes(1)
    // A page saved since may have moved its places' answers.
    await takeCategoryListings('philly', 'restaurant')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('drops an answer nobody took in time', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async () => answer([]))
    vi.stubGlobal('fetch', fetch)
    prefetchCategoryListings('philly', 'restaurant')
    vi.advanceTimersByTime(FRESH_MS + 1)
    await takeCategoryListings('philly', 'restaurant')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('says when the places couldn’t be had', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 500 })))
    expect(await takeCategoryListings('philly', 'restaurant')).toEqual({ ok: false, resources: [] })
  })

  // Category ids are a community's own: Washington's admin opening its
  // Grocery page was shown Philly's groceries (Nov 18 review), the ask
  // carrying no community so the route fell back to the default one.
  it('asks for the community’s own places, and never hands one community’s to another', async () => {
    const fetch = vi.fn(async (url: string) => answer([{ id: new URL(url, 'http://x').searchParams.get('community') }]))
    vi.stubGlobal('fetch', fetch)
    prefetchCategoryListings('philly', 'grocery')
    expect(await takeCategoryListings('washington', 'grocery')).toEqual({ ok: true, resources: [{ id: 'washington' }] })
    expect(await takeCategoryListings('philly', 'grocery')).toEqual({ ok: true, resources: [{ id: 'philly' }] })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
