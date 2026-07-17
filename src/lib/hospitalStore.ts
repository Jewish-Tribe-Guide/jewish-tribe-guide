import { getAdminClient } from './supabase/admin'
import type { Hospital } from '@/types'

type HospitalRow = {
  id: string
  name: string
  latitude: number
  longitude: number
  timezone: string
  info: Hospital['info']
}

/** Every hospital, ordered for display. Empty for a non-hospital community. */
export async function listHospitals(): Promise<Hospital[]> {
  const { data, error } = await getAdminClient()
    .from('hospital')
    .select('id, name, latitude, longitude, timezone, info')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(`Failed to load hospitals: ${error.message}`)
  return (data as HospitalRow[]).map((h) => ({
    id: h.id,
    name: h.name,
    latitude: h.latitude,
    longitude: h.longitude,
    timezone: h.timezone,
    info: h.info ?? undefined,
  }))
}

/** Map of hospital id → name, for labeling request rows without shipping the
 *  whole list. Falls back to an empty map if the table can't be read. */
export async function hospitalNameMap(): Promise<Record<string, string>> {
  try {
    const rows = await listHospitals()
    return Object.fromEntries(rows.map((h) => [h.id, h.name]))
  } catch {
    return {}
  }
}
