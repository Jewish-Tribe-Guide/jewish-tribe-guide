import { reportServerError } from '../serverError'

// ── A missed migration says so (Nov 20, the health sweep) ──
// Migrations are pasted into the SQL editor by hand, dev then live. A store
// whose table or column isn't there yet carries on without it rather than
// failing the page: no watches, no eruvim, no taught words. Right for a
// visitor, but it hid a missed migration completely. Nothing failed and
// nothing was logged; a feature was just off on live.
//
// So every such fallback goes through here, which tells the log and Sentry
// (live only, serverError.ts), once per name per server instance, so a busy
// page doesn't send one per request. `npm run migrations:report` then says
// which migration it is. src/test/schemaMissingReported.test.ts fails on a
// store that reads Postgres' "does not exist" itself instead.

const said = new Set<string>()

/** Says, once per name, that a table or column isn't in this database. */
export function saySchemaMissing(name: string): void {
  if (said.has(name)) return
  said.add(name)
  reportServerError(`[schema] ${name} isn’t in the database: a migration hasn’t run here (npm run migrations:report)`)
}

/** Whether a Supabase error's message says `name` (a table or column)
 *  isn't there, and says so when it does. */
export function schemaMissing(name: string, message: string | undefined): boolean {
  const missing = !!message && new RegExp(`\\b${name}\\b`).test(message) && /(does not exist|schema cache)/.test(message)
  if (missing) saySchemaMissing(name)
  return missing
}

/** For tests: forget what's been said. */
export function forgetSaidSchema(): void {
  said.clear()
}
