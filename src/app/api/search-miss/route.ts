import { appendRow } from '@/lib/sheets'
import { enforceRateLimit } from '@/lib/rateLimit'
import { payloadTooLarge } from '@/lib/limits'
import { easternTimestamp } from '@/lib/time'

// Logs searches that returned nothing, so we can see what the community looks
// for but can't find — a ranked content to-do list written by real users.
// Append-only to a "Missed Searches" tab; no email, no geocode, no PII.
const SEARCHES_SHEET_TAB = 'Missed Searches'
const MAX_QUERY_LEN = 200
const MAX_SOURCE_LEN = 80

export async function POST(request: Request) {
  // Public + fires automatically from the client, so cap it hard to keep it from
  // being used to spam the sheet.
  const limited = await enforceRateLimit(request, 'search-miss', { limit: 20, windowSec: 60 })
  if (limited) return limited

  let body: { query?: unknown; source?: unknown }
  try {
    body = (await request.json()) as { query?: unknown; source?: unknown }
  } catch {
    return Response.json({ ok: false }, { status: 400 })
  }

  const tooBig = payloadTooLarge(body)
  if (tooBig) return Response.json({ ok: false }, { status: 413 })

  const query =
    typeof body.query === 'string' ? body.query.trim().slice(0, MAX_QUERY_LEN) : ''
  // Which screen the search happened on (e.g. "Home", "Food Establishments").
  const source =
    typeof body.source === 'string' ? body.source.trim().slice(0, MAX_SOURCE_LEN) : ''
  // Ignore noise — single letters mid-typing aren't a real "miss".
  if (query.length < 3) return Response.json({ ok: true })

  // Best-effort: a logging failure must never surface to the visitor.
  try {
    await appendRow([easternTimestamp(), source, query], { tab: SEARCHES_SHEET_TAB })
  } catch (err) {
    console.error('[search-miss] Sheets append failed:', err)
  }

  return Response.json({ ok: true })
}
