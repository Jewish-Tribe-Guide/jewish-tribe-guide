import type { DirectoryResource } from '@/types'
import { withCommunity } from '@/lib/useCommunityData'

// Another category's places, loaded once per tab: a listing's places
// within a walk (WalkList), and the WhatsApp groups a sign-up minyan's
// editor picks from (SignUp). Not on the page that asks, so fetched.

/** Kept this long, then loaded again: a tab left open for days still sees
 *  a new shul. */
const FRESH_MS = 10 * 60 * 1000
const loaded = new Map<string, { at: number; places: Promise<DirectoryResource[]> }>()

export function loadPlaces(community: string, categoryId: string): Promise<DirectoryResource[]> {
  const key = `${community}:${categoryId}`
  const hit = loaded.get(key)
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.places
  const places = fetch(withCommunity(`/api/resources?category=${encodeURIComponent(categoryId)}`, community)).then(async (res) => {
    const body = await res.json()
    if (!res.ok || !body.ok) throw new Error('Could not load places')
    return body.resources as DirectoryResource[]
  })
  // A failure is tried again next time, not remembered.
  places.catch(() => loaded.delete(key))
  loaded.set(key, { at: Date.now(), places })
  return places
}

/** For tests: forget what's been loaded. */
export function forgetLoadedPlaces() {
  loaded.clear()
}
