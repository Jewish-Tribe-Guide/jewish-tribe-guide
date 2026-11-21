import { getAdminClient } from '@/lib/supabase/admin'
import type { ListingColumns } from '@/lib/listingPatch'

// For a store's tests whose Supabase mock records `update(...)`: patchListing
// (listingPatch.ts) as the whole write it stands for, so a test can still
// say what the listing ends up as. What patchListing itself sends is
// listingPatch.test.ts's to check. Use with
//   vi.mock('@/lib/listingPatch', () => import('@/test/patchAsWholeWrite'))
export { diffDetails } from '@/lib/listingPatch'

export async function patchListing(
  community: string,
  id: string,
  _before: Record<string, unknown>,
  after: Record<string, unknown>,
  { columns }: { columns?: ListingColumns; ifStill?: Record<string, string | null> } = {},
): Promise<boolean> {
  const { error } = await getAdminClient().from('resource').update({ ...columns, details: after }).eq('community_id', community).eq('id', id)
  if (error) throw new Error(error.message)
  return true
}
