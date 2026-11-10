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
    prefetchCategoryListings('restaurant')
    prefetchCategoryListings('restaurant')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(await takeCategoryListings('restaurant')).toEqual({ ok: true, resources: [{ id: 'a' }] })
    expect(fetch).toHaveBeenCalledTimes(1)
    // A page saved since may have moved its places' answers.
    await takeCategoryListings('restaurant')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('drops an answer nobody took in time', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async () => answer([]))
    vi.stubGlobal('fetch', fetch)
    prefetchCategoryListings('restaurant')
    vi.advanceTimersByTime(FRESH_MS + 1)
    await takeCategoryListings('restaurant')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('says when the places couldn’t be had', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 500 })))
    expect(await takeCategoryListings('restaurant')).toEqual({ ok: false, resources: [] })
  })
})
