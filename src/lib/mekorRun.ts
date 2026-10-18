// One run of the Mekor Habracha watch: read Mekor's kosher list and put
// every difference from the guide in the moderation queue (see
// mekorWatch.ts). Writes no listing: an admin approves or rejects each
// suggestion with Mekor's own words in front of them.
//
// Run daily by /api/cron/watches for a website watch on Mekor's list, and on
// demand from the admin Watches tab. `dry` says what it would file and
// files nothing.

import { getAdminClient } from '@/lib/supabase/admin'
import { sendWatchDigest, type WatchDigestItem } from '@/lib/email'
import { submitListingCreate, submitListingUpdate } from '@/lib/submissionStore'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import { askGoogleIfOpen } from '@/lib/keystoneRun'
import {
  MEKOR_WATCH_NAME,
  compareMekor,
  findingKey,
  findingNote,
  parseMekorList,
  submissionKey,
  type GuideListing,
  type MekorFinding,
  type PendingCreate,
} from '@/lib/mekorWatch'

/** Fewer places than this means the page changed shape, not that Mekor
 *  dropped half its list: file nothing rather than a card for every IKC
 *  place in the guide. The list had 78 on Oct 18, 2026. */
const MIN_ENTRIES = 40

const CATEGORIES = ['restaurant', 'grocery']

/** Ten digits as the guide writes a phone. */
function phone(digits: string): string {
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits
}

function describe(f: MekorFinding): WatchDigestItem {
  if (f.kind === 'new') return { name: f.entry.name, what: f.archived ? 'On Mekor’s list, archived in the guide' : 'On Mekor’s list, not in the guide' }
  if (f.kind === 'only-here') return { name: f.listing.name, what: 'IKC in the guide, not on Mekor’s list' }
  const what = [f.removed.length && `Mekor doesn’t say ${f.removed.join(', ')}`, f.added.length && `Mekor says ${f.added.join(', ')}`].filter(Boolean).join('; ')
  return { name: f.listing.name, what }
}

export type MekorRun =
  | { ok: false; error: string }
  | {
      ok: true
      entries: number
      findings: number
      filed: number
      closedOnGoogle: string[]
      /** A dry run's suggestions, unfiled. */
      wouldFile?: (WatchDigestItem & { kind: MekorFinding['kind']; note: string })[]
    }

export async function runMekorWatch(community: string, url: string, { dry = false }: { dry?: boolean } = {}): Promise<MekorRun> {
  let res: Response
  try {
    res = await fetch(url, { headers: WATCH_FETCH_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  } catch (err) {
    return { ok: false, error: `Couldn’t reach Mekor Habracha’s list (${err instanceof Error ? err.message : String(err)})` }
  }
  if (!res.ok) return { ok: false, error: `Mekor Habracha’s list answered ${res.status}` }
  const { updated, entries } = parseMekorList(await res.text())
  if (entries.length < MIN_ENTRIES) {
    return { ok: false, error: `Read only ${entries.length} places from Mekor Habracha’s list; its page may have changed. Nothing filed.` }
  }

  const supabase = getAdminClient()
  // Archived listings too: a place Mekor still lists that the guide took
  // down is said as such, not suggested as if the guide never had it.
  const { data: rows, error } = await supabase
    .from('resource')
    .select('id,category,name,address,phone,anchor_id,distance,details,status')
    .eq('community_id', community)
    .in('status', ['approved', 'archived'])
    .in('category', CATEGORIES)
  if (error) return { ok: false, error: `Couldn’t read the guide's listings: ${error.message}` }

  // New places already in the queue, from anyone: Keystone-K's watch files
  // many of the same places.
  const { data: queued, error: queuedError } = await supabase
    .from('submission')
    .select('id,payload')
    .eq('community_id', community)
    .eq('status', 'pending')
    .eq('operation', 'create')
    .eq('target_type', 'listing')
  if (queuedError) return { ok: false, error: `Couldn’t read the queue: ${queuedError.message}` }
  const pending: PendingCreate[] = (queued ?? [])
    .map((s) => ({ id: s.id as string, p: (s.payload ?? {}) as Record<string, unknown> }))
    .filter(({ p }) => CATEGORIES.includes(String(p.category)))
    .map(({ id, p }) => ({
      id,
      name: String(p.name ?? ''),
      address: (p.address as string | null) ?? null,
      phone: (p.phone as string | null) ?? null,
      details: (p.details ?? {}) as Record<string, unknown>,
    }))

  const findings = compareMekor(entries, (rows ?? []) as GuideListing[], pending)

  // Everything this watch has filed before, whatever became of it: a
  // suggestion an admin rejected isn't made again until the list changes.
  const { data: earlier, error: earlierError } = await supabase
    .from('submission')
    .select('operation,target_id,payload,note')
    .eq('community_id', community)
    .eq('submitted_by->>name', MEKOR_WATCH_NAME)
  if (earlierError) return { ok: false, error: `Couldn’t read earlier suggestions: ${earlierError.message}` }
  const filed = new Set((earlier ?? []).map(submissionKey).filter(Boolean))
  const unfiled = findings.filter((f) => !filed.has(findingKey(f)))

  // Mekor's list lags, as Keystone-K's does: a place it lists that the
  // guide lacks is asked about on Google first, and a permanently closed
  // one isn't suggested.
  const notes = new Map<MekorFinding, string>()
  const closed: string[] = []
  const fresh: MekorFinding[] = []
  for (const f of unfiled) {
    let note = findingNote(f, updated)
    if (f.kind === 'new') {
      const g = await askGoogleIfOpen(f.entry.name, f.entry.address)
      if (g.closed) {
        closed.push(f.entry.name)
        continue
      }
      note += `\n${g.line}`
    }
    notes.set(f, note)
    fresh.push(f)
  }

  if (dry) {
    return {
      ok: true,
      entries: entries.length,
      findings: findings.length,
      filed: 0,
      closedOnGoogle: closed,
      wouldFile: fresh.map((f) => ({ kind: f.kind, ...describe(f), note: notes.get(f)! })),
    }
  }

  const by = { name: MEKOR_WATCH_NAME }
  const items: WatchDigestItem[] = []
  for (const f of fresh) {
    const note = notes.get(f)!
    if (f.kind === 'new') {
      // An archived listing's own name and address, which the guide had
      // already tidied; otherwise Mekor's.
      const from = f.archived
      await submitListingCreate(
        community,
        {
          category: 'restaurant',
          name: from?.name ?? f.entry.name,
          anchorId: 'community',
          distance: null,
          address: from?.address ?? f.entry.address,
          phone: from?.phone ?? phone(f.entry.phone),
          details: f.details,
          submittedBy: by,
        },
        note,
      )
    } else {
      const l = f.listing
      await submitListingUpdate(
        community,
        l.id,
        {
          category: l.category,
          name: l.name,
          anchorId: l.anchor_id,
          distance: l.distance,
          address: l.address ?? '',
          phone: l.phone ?? '',
          details: f.details,
        },
        note,
        by,
      )
    }
    items.push(describe(f))
  }

  await sendWatchDigest(community, 'Mekor Habracha’s list', items).catch((err) => console.error('[watch-mekor] digest failed:', err))

  return { ok: true, entries: entries.length, findings: findings.length, filed: items.length, closedOnGoogle: closed }
}
