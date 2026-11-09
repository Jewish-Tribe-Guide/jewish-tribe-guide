import type { CategoryConfig } from './categories'
import type { DirectoryResource } from '@/types'

// The category editor's preview, A listing (board 5): the page's most
// filled-in place, so each of its fields has an answer to show.

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v !== null && v !== undefined && v !== false)

/** How many of the page's fields a place has answered, its address and
 *  phone among them. */
export function answered(item: DirectoryResource, category: Pick<CategoryConfig, 'detailFields'>): number {
  const row = item as unknown as Record<string, unknown>
  return [item.address, item.phone, ...category.detailFields.map((f) => row[f.key])].filter(filled).length
}

/** The place with the most answers; the first listed of those tied. */
export function fullestListing(items: readonly DirectoryResource[], category: Pick<CategoryConfig, 'detailFields'>): DirectoryResource | null {
  let best: DirectoryResource | null = null
  let most = -1
  for (const item of items) {
    const n = answered(item, category)
    if (n > most) [best, most] = [item, n]
  }
  return best
}
