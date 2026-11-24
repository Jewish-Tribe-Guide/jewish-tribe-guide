import { ADMIN_WRITE_TEST_ADMIN_EMAIL, CACHE_TEST_ADMIN_EMAIL } from './cacheE2eAdmin.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// The community the write suites (cache-roundtrip, admin-write) work in:
// philly, as the seed (supabase/seed) has it, in a database of their own.
//
// Until Nov 23 they worked in `e2e-writes`, a hidden copy of philly's shape
// made on the shared test project, so nothing they changed reached the
// community e2e read there at the same moment. Each suite has its own
// database now, so they use the real one: its listings, settings and pages
// are what the site serves.
// ─────────────────────────────────────────────────────────────────────────────

export const TEST_COMMUNITY = 'philly'

/** Both suites' own admins, put on the community's list by the test server,
 *  so each signs in as itself rather than as whoever the seed names. One
 *  person for both would cancel each other's magic links in a local run
 *  beside CI's (see cacheE2eAdmin.mjs). */
export const TEST_ADMINS = [CACHE_TEST_ADMIN_EMAIL, ADMIN_WRITE_TEST_ADMIN_EMAIL]

/** Adds the test admins to the community's admin list, keeping who's on it.
 *  Also puts them back if a Team test that failed half-way took them off. */
export async function ensureTestAdmins(supabase) {
  const { data: row, error } = await supabase.from('community').select('admin_emails').eq('slug', TEST_COMMUNITY).single()
  if (error) throw new Error(`Could not read ${TEST_COMMUNITY}: ${error.message}`)
  const emails = row.admin_emails ?? []
  const missing = TEST_ADMINS.filter((e) => !emails.includes(e))
  if (!missing.length) return
  const { error: fixError } = await supabase.from('community').update({ admin_emails: [...emails, ...missing] }).eq('slug', TEST_COMMUNITY)
  if (fixError) throw new Error(`Could not add the test admins to ${TEST_COMMUNITY}: ${fixError.message}`)
}
