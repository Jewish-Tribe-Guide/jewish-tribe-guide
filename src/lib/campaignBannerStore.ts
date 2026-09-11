import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
// Straight from routes.ts (categoryStore.ts's own source for this), not
// re-exported via categoryStore.ts — that file now imports from this one
// (to fold active campaigns into which categories are visible), so
// importing back from it here would be a circular dependency.
import { slugify } from './routes'
import type { CampaignBanner } from './campaignBanner'

type CampaignBannerRow = {
  id: string
  category_id: string
  title: string
  subtitle: string
  start_date: string
  end_date: string
  destination: string | null
}

function toBanner(row: CampaignBannerRow): CampaignBanner {
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.title,
    subtitle: row.subtitle ?? '',
    startDate: row.start_date,
    endDate: row.end_date,
    // Same "read before this migration ran" fallback every other widened
    // column in this codebase uses (see homeSectionStore.ts's toSection) —
    // a row selected via `select('*')` before the column existed simply
    // won't have the key.
    destination: row.destination === 'list' ? 'list' : 'map',
  }
}

// Uncached — reads Supabase directly. Used by the admin route, which needs
// read-after-write consistency (revalidateTag only marks the public cache
// stale, it doesn't purge it — see homeSectionStore.ts's identical note).
export async function listCampaignBannersUncached(community: string): Promise<CampaignBanner[]> {
  const { data, error } = await getAdminClient()
    .from('campaign_banner')
    .select('*')
    .eq('community_id', community)
    .order('start_date', { ascending: true })

  if (error) throw new Error(`Failed to load campaign banners: ${error.message}`)
  return (data as CampaignBannerRow[]).map(toBanner)
}

// Same as listCampaignBannersUncached, but cached for the public site.
export async function listCampaignBanners(community: string): Promise<CampaignBanner[]> {
  'use cache'
  cacheTag(TAGS.campaignBanners(community))
  cacheLife('days')
  return listCampaignBannersUncached(community)
}

export async function createCampaignBanner(
  community: string,
  input: {
    categoryId: string
    title: string
    subtitle?: string
    startDate: string
    endDate: string
    destination?: 'list' | 'map'
  },
): Promise<CampaignBanner> {
  const supabase = getAdminClient()
  const base = slugify(input.title) || 'campaign'

  // Scoped by community — see createCategory's/createHomeSection's identical
  // dedupe loop.
  let id = base
  for (let n = 2; ; n++) {
    const { data } = await supabase
      .from('campaign_banner')
      .select('id')
      .eq('community_id', community)
      .eq('id', id)
      .maybeSingle()
    if (!data) break
    id = `${base}-${n}`
  }

  const row = {
    id,
    community_id: community,
    category_id: input.categoryId,
    title: input.title.trim(),
    subtitle: input.subtitle?.trim() ?? '',
    start_date: input.startDate,
    end_date: input.endDate,
    destination: input.destination === 'list' ? 'list' : 'map',
  }

  const { data, error } = await supabase.from('campaign_banner').insert(row).select('*').single()
  if (error) throw new Error(`Failed to create campaign banner: ${error.message}`)
  return toBanner(data as CampaignBannerRow)
}

// Only the provided keys change. The slug (id) is immutable, same as
// updateHomeSection/updateCategory.
export async function updateCampaignBanner(
  community: string,
  id: string,
  patch: Partial<{
    categoryId: string
    title: string
    subtitle: string
    startDate: string
    endDate: string
    destination: 'list' | 'map'
  }>,
): Promise<CampaignBanner | null> {
  const supabase = getAdminClient()

  const row: Record<string, unknown> = {}
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId
  if (patch.title !== undefined) row.title = patch.title.trim()
  if (patch.subtitle !== undefined) row.subtitle = patch.subtitle.trim()
  if (patch.startDate !== undefined) row.start_date = patch.startDate
  if (patch.endDate !== undefined) row.end_date = patch.endDate
  if (patch.destination !== undefined) row.destination = patch.destination

  if (Object.keys(row).length === 0) {
    const { data } = await supabase
      .from('campaign_banner')
      .select('*')
      .eq('community_id', community)
      .eq('id', id)
      .maybeSingle()
    return data ? toBanner(data as CampaignBannerRow) : null
  }

  const { data, error } = await supabase
    .from('campaign_banner')
    .update(row)
    .eq('community_id', community)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`Failed to update campaign banner: ${error.message}`)
  return data ? toBanner(data as CampaignBannerRow) : null
}

export async function deleteCampaignBanner(community: string, id: string): Promise<void> {
  const { error } = await getAdminClient()
    .from('campaign_banner')
    .delete()
    .eq('community_id', community)
    .eq('id', id)
  if (error) throw new Error(`Failed to delete campaign banner: ${error.message}`)
}
