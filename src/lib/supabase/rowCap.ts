import { ROW_CAP } from '@/lib/readAll'
import { reportServerError } from '@/lib/serverError'

// ── A read cut off at the row cap is reported, not silent (Nov 20) ──
// readAll (src/lib/readAll.ts) pages the reads known to grow, and
// readsArePaged.test.ts keeps new ones in line. This is the net under
// both: any read the server makes that asked for no limit and came back
// with exactly the cap's worth of rows was very likely cut short, so it
// goes to Sentry, one issue per table, with the filters it used named but
// not their values (those can be someone's email).
//
// Read from the response's Content-Range ("0-999/*"), so nothing is
// parsed twice. It only reports; the read's caller gets its rows as before.

/** The table and filter names of a database read, without their values. */
export function describeRead(url: string): string {
  const u = new URL(url)
  const table = u.pathname.replace(/^.*\/rest\/v1\//, '')
  const names = [...new Set([...u.searchParams.keys()])].sort()
  return names.length ? `${table} (${names.join(', ')})` : table
}

/** True when a response to an unlimited read holds a full page of rows. */
export function cutAtCap(url: string, method: string, contentRange: string | null): boolean {
  if (method.toUpperCase() !== 'GET' || !contentRange) return false
  const u = new URL(url)
  if (!u.pathname.includes('/rest/v1/') || u.searchParams.has('limit')) return false
  const m = /^(\d+)-(\d+)\//.exec(contentRange)
  return !!m && Number(m[2]) - Number(m[1]) + 1 >= ROW_CAP
}

/** `inner`, reporting any read that came back at the cap. */
export function reportingRowCap(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    const res = await inner(input, init)
    try {
      const request = typeof input === 'object' && 'method' in input ? input : null
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const method = init?.method ?? request?.method ?? 'GET'
      if (cutAtCap(url, method, res.headers.get('content-range'))) {
        reportServerError(`[db] a read stopped at ${ROW_CAP} rows: ${describeRead(url).split(' ')[0]}`, describeRead(url))
      }
    } catch {
      // Checking must never be what breaks a read.
    }
    return res
  }
}
