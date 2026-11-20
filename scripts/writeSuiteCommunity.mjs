import { ADMIN_WRITE_TEST_ADMIN_EMAIL, CACHE_TEST_ADMIN_EMAIL } from './cacheE2eAdmin.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// The community the write suites (cache-roundtrip, admin-write) change, so
// that nothing they do reaches the community the read-only e2e suite reads.
//
// They used to change philly, the test project's default community and the
// one e2e reads, so CI had to keep them apart in time: e2e's build waited
// for both write suites to finish (it prerenders from the rows they rename,
// reorder and restore), and a PR's run was the two of them end to end.
// Kept apart by community instead, they all start at once (Nov 20).
//
// Hidden, so it never shows in the switcher on the dev site (the test
// project is also dev). The write suites reach its public pages with the
// preview token below, which is test-only: it opens a hidden community in a
// disposable project, nothing else.
//
// Its shape comes from philly once: categories, home sections, forms and
// site settings, copied when it has no categories yet. After that it is
// left alone, so a test's rows are its own. Every insert ignores rows that
// already exist, because the three test servers start at once and each
// runs this.
//
// What is still shared: the `page` rows (About, Privacy) have no community,
// so cache-roundtrip's About edit and admin-write's Privacy edit show on
// philly's pages too, briefly. e2e only checks those pages' structure (a
// heading with text, axe), never their words, so that is harmless.
// ─────────────────────────────────────────────────────────────────────────────

export const WRITE_SUITE_COMMUNITY = 'e2e-writes'
const WRITE_SUITE_PREVIEW_TOKEN = '0b6f3c1e-e2e0-4ead-8000-0000e2e0a11e'
/** Where its shape is copied from. */
const SOURCE = 'philly'

/** Both suites' own admins, listed on the community itself, so each signs
 *  in as itself rather than as whoever philly's real admin is. Two suites
 *  signing in as one person cancel each other's magic links (see
 *  cacheE2eAdmin.mjs). */
export const WRITE_SUITE_ADMINS = [CACHE_TEST_ADMIN_EMAIL, ADMIN_WRITE_TEST_ADMIN_EMAIL]

/** Rows the suites make for themselves, never copied. */
const isTestRow = (id) => /^(e2e-|integration-test-|vote-test-|cache-roundtrip-)/.test(String(id))

function copyOf(rows) {
  return (rows ?? []).filter((r) => !isTestRow(r.id)).map((r) => {
    const row = { ...r, community_id: WRITE_SUITE_COMMUNITY }
    delete row.created_at
    delete row.updated_at
    return row
  })
}

export async function ensureWriteSuiteCommunity(supabase) {
  const { data: source, error: sourceError } = await supabase.from('community').select('*').eq('slug', SOURCE).maybeSingle()
  if (sourceError) throw new Error(`Could not read ${SOURCE}: ${sourceError.message}`)

  const { error } = await supabase.from('community').upsert(
    {
      slug: WRITE_SUITE_COMMUNITY,
      name: 'E2E writes',
      short_name: 'E2E writes',
      mission: 'The write test suites change this community, never the one the read-only suite reads.',
      manifest_description: 'Test community.',
      region: source?.region ?? 'Philadelphia',
      timezone: source?.timezone ?? 'America/New_York',
      map_center: source?.map_center ?? { lat: 39.95, lng: -75.16 },
      theme_color: source?.theme_color ?? '#1d4ed8',
      background_color: source?.background_color ?? '#f8fafc',
      features: source?.features ?? {},
      ui: source?.ui ?? {},
      sort_order: 900,
      is_default: false,
      visible: false,
      preview_token: WRITE_SUITE_PREVIEW_TOKEN,
      admin_emails: WRITE_SUITE_ADMINS,
    },
    { onConflict: 'slug', ignoreDuplicates: true },
  )
  if (error) throw new Error(`Could not create ${WRITE_SUITE_COMMUNITY}: ${error.message}`)

  // Put back what a test may have left wrong: both admins on the list (a
  // Team test that failed half-way can leave someone else on it, which
  // locks everyone not on it out), and the token the suites carry.
  const { data: row } = await supabase.from('community').select('admin_emails, visible, preview_token').eq('slug', WRITE_SUITE_COMMUNITY).single()
  const emails = row?.admin_emails ?? []
  const missing = WRITE_SUITE_ADMINS.filter((e) => !emails.includes(e))
  if (missing.length || row?.visible || row?.preview_token !== WRITE_SUITE_PREVIEW_TOKEN) {
    const { error: fixError } = await supabase
      .from('community')
      .update({ admin_emails: [...emails, ...missing], visible: false, preview_token: WRITE_SUITE_PREVIEW_TOKEN })
      .eq('slug', WRITE_SUITE_COMMUNITY)
    if (fixError) throw new Error(`Could not reset ${WRITE_SUITE_COMMUNITY}: ${fixError.message}`)
  }

  const { count } = await supabase.from('category').select('id', { count: 'exact', head: true }).eq('community_id', WRITE_SUITE_COMMUNITY)
  if (count) return

  for (const [table, onConflict] of [
    ['category', 'community_id,id'],
    ['home_section', 'community_id,id'],
    ['form', 'community_id,id'],
    ['site_settings', 'community_id'],
  ]) {
    const { data, error: readError } = await supabase.from(table).select('*').eq('community_id', SOURCE)
    if (readError) throw new Error(`Could not read ${SOURCE}'s ${table}: ${readError.message}`)
    const rows = copyOf(data)
    if (!rows.length) continue
    const { error: copyError } = await supabase.from(table).upsert(rows, { onConflict, ignoreDuplicates: true })
    if (copyError) throw new Error(`Could not copy ${table} into ${WRITE_SUITE_COMMUNITY}: ${copyError.message}`)
  }
}

/** The cookie that opens the hidden community's public pages, as Playwright
 *  takes it (storageState or addCookies), for a server at `baseURL`. Same
 *  name and path proxy.ts sets from `?access=` (src/lib/previewCookie.ts). */
export function writeSuitePreviewCookie(baseURL) {
  return {
    name: `jpc_preview_${WRITE_SUITE_COMMUNITY}`,
    value: WRITE_SUITE_PREVIEW_TOKEN,
    domain: new URL(baseURL).hostname,
    path: '/',
    expires: -1,
    httpOnly: true,
    secure: false,
    sameSite: /** @type {'Lax'} */ ('Lax'),
  }
}
