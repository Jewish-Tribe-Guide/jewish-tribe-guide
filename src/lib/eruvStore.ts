import { getAdminClient } from './supabase/admin'
import type { Eruv, EruvStatus } from './eruv'

// The eruv table (migration 074): each eruv and its status as last read.
// Uncached: the status changes through the day, and /api/eruv reads it
// fresh. A missing table (the migration not run yet) isn't an error: the
// page falls back to the old list.

const COLUMNS =
  'id, name, covers, website, hotline, alerts_url, status_url, status_dated, status, status_words, status_posted_on, status_checked_at, status_error_at, status_error'

type Row = {
  id: string
  name: string
  covers: string | null
  website: string | null
  hotline: string | null
  alerts_url: string | null
  status_url: string | null
  status_dated: boolean
  status: EruvStatus | null
  status_words: string | null
  status_posted_on: string | null
  status_checked_at: string | null
  status_error_at: string | null
  status_error: string | null
}

function fromRow(r: Row): Eruv {
  return {
    id: r.id,
    name: r.name,
    covers: r.covers,
    website: r.website,
    hotline: r.hotline,
    alertsUrl: r.alerts_url,
    statusUrl: r.status_url,
    statusDated: r.status_dated,
    status: r.status,
    statusWords: r.status_words,
    statusPostedOn: r.status_posted_on,
    statusCheckedAt: r.status_checked_at,
    statusErrorAt: r.status_error_at,
    statusError: r.status_error,
  }
}

export function eruvTableMissing(message: string | undefined): boolean {
  return !!message && /\beruv\b/.test(message) && /(does not exist|schema cache)/.test(message)
}

/** A community's active eruvim, in their order. `available` is false
 *  without migration 074. */
export async function listEruvim(community: string): Promise<{ eruvim: Eruv[]; available: boolean }> {
  const { data, error } = await getAdminClient().from('eruv').select(COLUMNS).eq('community_id', community).eq('active', true).order('sort_order').order('name')
  if (error) {
    if (eruvTableMissing(error.message)) return { eruvim: [], available: false }
    throw new Error(`Failed to load eruvim: ${error.message}`)
  }
  return { eruvim: ((data ?? []) as Row[]).map(fromRow), available: true }
}

export type StatusWrite =
  | { ok: true; status: EruvStatus; words: string | null; postedOn: string | null; at: string }
  | { ok: false; error: string; at: string }

/** Records one read of an eruv's page: what it said, or why it couldn't
 *  be read. A failed read keeps the last status, so the page can say
 *  when it was last read properly. */
export async function saveStatusRead(community: string, id: string, read: StatusWrite): Promise<void> {
  const patch = read.ok
    ? { status: read.status, status_words: read.words, status_posted_on: read.postedOn, status_checked_at: read.at, status_error: null, updated_at: read.at }
    : { status_error_at: read.at, status_error: read.error.slice(0, 300), updated_at: read.at }
  const { error } = await getAdminClient().from('eruv').update(patch).eq('community_id', community).eq('id', id)
  if (error) throw new Error(`Failed to save the eruv status: ${error.message}`)
}
