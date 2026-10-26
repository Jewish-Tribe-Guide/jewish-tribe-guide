'use client'

import { useState } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { hoursRows, sectionChanges, type HoursRow } from '@/lib/hoursSections'
import { samePage } from '@/lib/hoursJob'
import type { Watch } from '@/lib/watches'
import type { Finding } from '@/lib/watchFindings'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import BoxEditSheet, { type BoxEdit } from '@/components/resources/BoxEditSheet'
import { FOOD_HOURS_KEY, foodHoursEdit, withSave } from './findingEdits'
import type { Decision } from './FindingCompare'
import { day, shortUrl } from './JobPage'
import { Box, BoxActions, BoxRow, BoxRows, SourceLine } from './JobBoxes'

// ── A food place's hours, from its own website (Main dishes board 3) ───────
// Only for a place whose hours Google doesn't keep (hoursJob.ts's
// homePageReads): its website's reading, filed as the section `hours`
// (hoursSections.ts), drawn as the listing's Hours box. An update is open,
// every day it gives highlighted when the listing has none ("New"), a
// changed one beside what it was; Use this / Edit / Keep the listing and
// the page it's from. A page that agrees is a closed "Same" box.

/** The listing's plain hours field. */
export { FOOD_HOURS_KEY }
type HoursFinding = Finding & { values: Record<string, unknown> }

export const isFoodHoursFinding = (f: Finding): f is HoursFinding => f.operation === 'update' && f.section === FOOD_HOURS_KEY && !!f.values && FOOD_HOURS_KEY in f.values

const doneText = (d: Decision) => `${d === 'approved' ? 'Used' : 'Kept'} ${day(new Date().toISOString())}`

/** An update's pill: "New" when the listing has no hours, else how many
 *  days change. */
export function hoursPill(rows: readonly HoursRow[]): string {
  if (rows.length && rows.every((r) => r.mark === 'new')) return 'New'
  const n = sectionChanges(rows, false)
  return `${n} change${n === 1 ? '' : 's'}`
}

function Rows({ rows }: { rows: readonly HoursRow[] }) {
  return (
    <BoxRows>
      {rows.map((r, i) => (
        // A day the listing has none of is only highlighted (board 3): no
        // "Not listed" struck under it.
        <BoxRow key={i} name={r.days} right={r.text} mark={r.mark} was={r.mark === 'new' ? undefined : r.was} />
      ))}
    </BoxRows>
  )
}

export default function FoodHours({
  placeId,
  hours,
  findings,
  pages,
  settled,
  busy,
  token,
  community,
  show,
  onDecided,
}: {
  placeId: string
  /** Its hours as listed. */
  hours: unknown
  findings: readonly Finding[]
  /** Its website's pages the daily run reads. */
  pages: readonly Watch[]
  settled: ReadonlyMap<string, Decision>
  busy: boolean
  token: string
  community: string
  show: 'updates' | 'same'
  onDecided: (f: Finding, d: Decision) => void
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ item: DirectoryResource; category: CategoryConfig; edit: BoxEdit } | null>(null)
  const all = findings.filter(isFoodHoursFinding)
  const headers = { Authorization: `Bearer ${token}` }
  const readAt = (url?: string) => (url ? pages.find((w) => samePage(w.url, url))?.lastCheck?.at : undefined)

  async function decide(f: Finding, body: Record<string, unknown>, d: Decision) {
    setError(null)
    setSaving(f.id)
    try {
      await fetchJson(withCommunity(`/api/admin/submissions/${f.id}`, community), { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'Could not save that.')
      onDecided(f, d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setSaving(null)
    }
  }

  /** Edit: the listing's own Edit for its hours, filled in with the
   *  website's, saved straight to the listing. */
  /** Edit: the listing's own Edit for its hours, filled in with the
   *  website's, saved straight to the listing. */
  async function edit(f: HoursFinding) {
    setError(null)
    try {
      const { item, category } = await fetchJson<{ item: DirectoryResource; category: CategoryConfig }>(withCommunity(`/api/admin/main-dishes?item=${placeId}`, community), { headers }, 'Could not open its hours.')
      const fe = foodHoursEdit(f, category)
      if (!fe) return
      setEditing({ item, category, edit: withSave(fe, { community, token, onSaved: () => (setEditing(null), onDecided(f, 'approved')) }) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open its hours.')
    }
  }

  // The page that last read the listing's own hours.
  const agreeing = pages.find((w) => w.lastCheck?.what === 'hours' && w.lastCheck.result === 'agrees')
  const same = show === 'same' && !all.some((f) => !settled.has(f.id)) && agreeing && hoursRows(hours).length > 0 ? agreeing : null
  return (
    <>
      {show === 'updates' &&
        all.map((f) => {
          const decided = settled.get(f.id)
          const rows = hoursRows(hours, f.values[FOOD_HOURS_KEY])
          return (
            <Box key={decided ? `${f.id}-done` : f.id} name="Hours" pill={decided ? { text: doneText(decided), tone: 'grey' } : { text: hoursPill(rows), tone: 'amber' }} defaultOpen={!decided}>
              <Rows rows={rows} />
              {!decided && <BoxActions busy={busy || saving === f.id} onUse={() => void decide(f, { status: 'approved' }, 'approved')} onEdit={() => void edit(f)} onKeep={() => void decide(f, { status: 'rejected' }, 'rejected')} />}
              <SourceLine url={f.page} what={f.page ? shortUrl(f.page) : 'their website'} at={readAt(f.page) ?? f.at} />
            </Box>
          )
        })}
      {same && (
        <Box name="Hours" pill={{ text: 'Same', tone: 'grey' }}>
          <Rows rows={hoursRows(hours)} />
          <SourceLine lead="Same as" url={same.url} at={same.lastCheck?.at} />
        </Box>
      )}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {editing && <BoxEditSheet item={editing.item} category={editing.category} edit={editing.edit} onClose={() => setEditing(null)} />}
    </>
  )
}
