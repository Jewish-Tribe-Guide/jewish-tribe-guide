import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
import type { Hospital } from '@/types'

type HospitalRow = {
  id: string
  name: string
  latitude: number
  longitude: number
  timezone: string
}

/** Every hospital, ordered for display. Empty for a non-hospital community. */
export async function listHospitals(community: string): Promise<Hospital[]> {
  'use cache'
  cacheTag(TAGS.hospitals(community))
  cacheLife('days')
  const { data, error } = await getAdminClient()
    .from('hospital')
    // Deliberately not `info`: that column only ever held made-up placeholder
    // details (see Hospital in types.ts), and every page ships this list.
    .select('id, name, latitude, longitude, timezone')
    .eq('community_id', community)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(`Failed to load hospitals: ${error.message}`)
  return (data as HospitalRow[]).map((h) => ({
    id: h.id,
    name: h.name,
    latitude: h.latitude,
    longitude: h.longitude,
    timezone: h.timezone,
  }))
}

/** Map of hospital id → name, for labeling request rows without shipping the
 *  whole list. Falls back to an empty map if the table can't be read. */
export async function hospitalNameMap(community: string): Promise<Record<string, string>> {
  try {
    const rows = await listHospitals(community)
    return Object.fromEntries(rows.map((h) => [h.id, h.name]))
  } catch {
    return {}
  }
}
