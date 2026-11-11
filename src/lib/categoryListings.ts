import type { DirectoryResource } from '@/types'

// A category page's places, for its admin preview and count. The user, Nov 9:
// "Most noticable is clicking on a category page in admin." Opened from its
// address, the page waited for the list of pages before it asked for its
// places, one round trip after the other. Now the manager asks for both at
// once, and the preview (or, on a phone, the editor's count) takes the answer
// already on its way.
//
// Taken once: a page saved, its fields renamed, has its places' answers moved
// with it, so a later open asks again rather than reuse a copy from before. An
// answer nobody takes is dropped after FRESH_MS.

export type CategoryListings = { ok: boolean; resources: DirectoryResource[] }

export const FRESH_MS = 10_000

const waiting = new Map<string, { at: number; answer: Promise<CategoryListings> }>()

function ask(id: string): Promise<CategoryListings> {
  return fetch(`/api/resources?category=${encodeURIComponent(id)}`).then(async (res) => {
    const body = await res.json()
    return res.ok && body.ok ? { ok: true, resources: body.resources as DirectoryResource[] } : { ok: false, resources: [] }
  })
}

/** Starts asking for a page's places, before anything needs them. */
export function prefetchCategoryListings(id: string): void {
  const w = waiting.get(id)
  if (w && Date.now() - w.at < FRESH_MS) return
  const answer = ask(id)
  // Nobody may take it; a failure is the taker's to see.
  answer.catch(() => {})
  waiting.set(id, { at: Date.now(), answer })
}

/** A page's places: the answer already on its way, or a new ask. */
export function takeCategoryListings(id: string): Promise<CategoryListings> {
  const w = waiting.get(id)
  waiting.delete(id)
  return w && Date.now() - w.at < FRESH_MS ? w.answer : ask(id)
}

/** Tests: nothing left waiting from the one before. */
export function forgetCategoryListings(): void {
  waiting.clear()
}
