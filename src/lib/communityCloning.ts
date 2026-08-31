import { getAdminClient } from './supabase/admin'

// ─────────────────────────────────────────────────────────────────────────────
// Cloning an existing community's directory SHAPE into a brand-new one — the
// "Clone from…" option on the New Community form, as opposed to "Start empty".
//
// Copies `category` and `home_section` rows only, under the new community_id
// but the SAME row id — safe because both tables' primary key is
// (community_id, id) (see supabase/migrations/20240101000027_communities.sql),
// so this is genuinely a different row, not a collision.
//
// Deliberately does NOT touch:
//   - site_settings — the new community's branding already came from the
//     creation form; an empty site_settings row falls back to the community
//     row's own name/tagline/mission (see siteSettingsStore.ts), which is
//     exactly what should show until an admin edits it directly.
//   - form — Support/Volunteer are hardcoded/global for now, out of scope
//     here (see the New Community plan); nothing else to clone.
//   - resource (listings) and tag — never copy another community's real
//     business data or crowdsourced vocabulary into a new one.
// ─────────────────────────────────────────────────────────────────────────────

/** Strips columns that must never be copied verbatim — a fresh created_at,
 *  never someone else's — before the row goes into an insert built from it. */
function withoutTimestamps(row: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...row }
  delete rest.created_at
  delete rest.updated_at
  return rest
}

export async function cloneCommunityContent(target: string, source: string): Promise<void> {
  const supabase = getAdminClient()

  const { data: categories, error: catErr } = await supabase.from('category').select('*').eq('community_id', source)
  if (catErr) throw new Error(`Failed to read source categories: ${catErr.message}`)

  if (categories?.length) {
    const rows = (categories as Record<string, unknown>[]).map((row) => ({
      ...withoutTimestamps(row),
      community_id: target,
    }))
    const { error } = await supabase.from('category').insert(rows)
    if (error) throw new Error(`Failed to clone categories: ${error.message}`)
  }

  const { data: sections, error: sectionErr } = await supabase
    .from('home_section')
    .select('*')
    .eq('community_id', source)
  if (sectionErr) throw new Error(`Failed to read source home sections: ${sectionErr.message}`)

  if (sections?.length) {
    const rows = (sections as Record<string, unknown>[]).map((row) => ({
      ...withoutTimestamps(row),
      community_id: target,
    }))
    const { error } = await supabase.from('home_section').insert(rows)
    if (error) throw new Error(`Failed to clone home sections: ${error.message}`)
  }
}
