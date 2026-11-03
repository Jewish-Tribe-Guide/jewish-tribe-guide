import { getAdminClient } from './supabase/admin'
import type { FoundPage, FoundPlace, LookKind, LookRow } from './lookAgain'

// The look_again table (migration 092): Look again's tries, finds and stops
// (lookAgain.ts). Uncached: the job and the admin's page. Without the table,
// nothing is saved and `available` says so.

type Row = { kind: LookKind; target_id: string; tried_at: string | null; found: FoundPage | FoundPlace | null; not_these: unknown; stopped_at: string | null }

const COLUMNS = 'kind, target_id, tried_at, found, not_these, stopped_at'

export function lookTableMissing(message: string | undefined): boolean {
  return !!message && /\blook_again\b/.test(message) && /(does not exist|schema cache)/.test(message)
}

const fromRow = (r: Row): LookRow => ({
  kind: r.kind,
  targetId: r.target_id,
  triedAt: r.tried_at,
  found: r.found,
  notThese: Array.isArray(r.not_these) ? r.not_these.filter((x): x is string => typeof x === 'string') : [],
  stoppedAt: r.stopped_at,
})

export async function listLookRows(community: string): Promise<{ rows: LookRow[]; available: boolean }> {
  const { data, error } = await getAdminClient().from('look_again').select(COLUMNS).eq('community_id', community)
  if (error) {
    if (lookTableMissing(error.message)) return { rows: [], available: false }
    throw new Error(`Failed to load Look again: ${error.message}`)
  }
  return { rows: ((data ?? []) as Row[]).map(fromRow), available: true }
}

async function getRow(community: string, kind: LookKind, id: string): Promise<LookRow | null> {
  const { data, error } = await getAdminClient().from('look_again').select(COLUMNS).eq('community_id', community).eq('kind', kind).eq('target_id', id).maybeSingle()
  if (error) throw new Error(`Failed to load Look again: ${error.message}`)
  return data ? fromRow(data as Row) : null
}

async function save(community: string, kind: LookKind, id: string, patch: Partial<Omit<Row, 'kind' | 'target_id'>>): Promise<void> {
  const { error } = await getAdminClient()
    .from('look_again')
    .upsert({ community_id: community, kind, target_id: id, ...patch }, { onConflict: 'community_id,kind,target_id' })
  if (error) throw new Error(`Failed to save Look again: ${error.message}`)
}

/** A try, and what it found, if anything. */
export const saveTry = (community: string, kind: LookKind, id: string, at: string, found: FoundPage | FoundPlace | null) => save(community, kind, id, { tried_at: at, found })

/** Stop trying, or start again (null). */
export const saveStopped = (community: string, kind: LookKind, id: string, at: string | null) => save(community, kind, id, { stopped_at: at })

/** An admin's answer to a find: it goes, and a page turned down is never
 *  offered again. The next try is a month after this one. */
export async function answerFound(community: string, kind: LookKind, id: string, turnedDown: string | null): Promise<void> {
  const row = await getRow(community, kind, id)
  await save(community, kind, id, { found: null, ...(turnedDown ? { not_these: [...new Set([...(row?.notThese ?? []), turnedDown])] } : {}) })
}

export async function getNotThese(community: string, kind: LookKind, id: string): Promise<string[]> {
  return (await getRow(community, kind, id))?.notThese ?? []
}
