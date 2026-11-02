'use client'

import { useState, type ReactNode } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { ChangedTag } from '@/components/resources/editorParts'
import PlaceFrame, { PlaceButtons, PlaceCard, SourceCard, placeSubline, type PlaceButton, type PlacePosition } from './PlaceFrame'
import { kindsOf } from './WatchKinds'
import { waitingAnswers, type WaitAnswer } from './waitingAnswers'
import { ownGroups, waitingGroups, type WaitBox, type WaitGroup, type WaitRow } from './waitingGroups'
import type { Jobs } from './useWatchJobs'

// What a job read that's decided on the place itself (a closure, a check
// against Google, a menu's reading, a place the guide has archived), on To
// do as the change screens are (L2Visitor, L4Eruv, R4Back): what it would
// change, each thing in its own yellow card with what it was, a menu only
// its new and going dishes (E2Dishes); where it was read, folded under; and
// the answers at the foot. One reading at a time; once
// it's answered, the next one shows, or the place is done.

const CHANGED = 'border-amber-200 bg-yellow-50'
const MARK: Record<Exclude<WaitRow['mark'], 'same'>, string> = { new: 'New', gone: 'Going', changed: 'Changed' }

function Tag({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[12.5px] font-extrabold text-amber-800">{children}</span>
}

/** A box's rows that change something, or all of them when none is
 *  marked: a menu's reading lists every dish, and the rest are as listed. */
export function lit(b: WaitBox): WaitRow[] {
  const rows = b.groups.flatMap((x) => x.rows)
  const marked = rows.filter((r) => r.mark !== 'same')
  return marked.length > 0 ? marked : rows
}

/** The answers in the words of the change screens: one line, "Change to …"
 *  and "Keep …" while they're short; dishes only added, "Add the 2 dishes"
 *  and "Don’t add them" (E2Dishes); else "Update the listing" and "Leave
 *  it"; an archived place "Add to the guide" (R4Back). */
export function todoAnswerLabels(g: WaitGroup, answers: readonly WaitAnswer[]): WaitAnswer[] {
  const line = g.lines.length === 1 && !g.boxes?.length ? g.lines[0] : null
  const short = !!line && line.old !== null && line.value.length <= 24 && line.old.length <= 24
  const rows = g.decide.kind === 'menu' ? (g.boxes ?? []).flatMap(lit) : []
  const added = rows.length > 0 && rows.every((r) => r.mark === 'new') ? rows.length : 0
  return answers.map((a) => {
    if (a.label === 'Accept') return { ...a, label: short ? `Change to ${line!.value}` : added ? (added === 1 ? 'Add the dish' : `Add the ${added} dishes`) : 'Update the listing' }
    if (a.label === 'Keep as is') return { ...a, label: short ? `Keep ${line!.old}` : added ? (added === 1 ? 'Don’t add it' : 'Don’t add them') : 'Leave it' }
    if (a.label === 'Bring it back') return { ...a, label: 'Add to the guide' }
    return a
  })
}

export default function TodoReading({
  placeId,
  name,
  jobs,
  token,
  community,
  position,
  switches,
  reload,
}: {
  placeId: string
  name: string
  jobs: Jobs
  token: string
  community: string
  position: PlacePosition
  switches: ReactNode
  /** To do and the jobs read again, after an answer. */
  reload: () => Promise<void>
}) {
  const [now] = useState(() => Date.now())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const send = (method: 'PATCH' | 'POST', path: string, body: Record<string, unknown>) =>
    fetchJson(withCommunity(path, community), { method, headers, body: JSON.stringify(body) }, 'Could not do that.')

  const g = ownGroups(waitingGroups(placeId, jobs, now).groups)[0]
  const kind = kindsOf(jobs, '', now)?.kinds.find((k) => k.places.some((p) => p.id === placeId))
  const listing = kind?.places.find((p) => p.id === placeId)?.listing ?? null
  const subline = placeSubline(kind?.label ?? null, listing)
  if (!g) {
    return (
      <PlaceFrame name={name} subline={subline} position={position} switches={switches}>
        <p className="m-0 text-[15px] text-slate-600">Nothing waits here now.</p>
      </PlaceFrame>
    )
  }

  async function run(a: WaitAnswer) {
    setError(null)
    setBusy(a.label)
    try {
      await a.work()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that.')
    } finally {
      setBusy(null)
    }
  }
  const answers = todoAnswerLabels(g, waitingAnswers(g.decide, placeId, { patch: (id, body) => send('PATCH', `/api/admin/submissions/${id}`, body), post: (path, body) => send('POST', path, body) }))
  const buttons: PlaceButton[] = answers.map((a) => ({ label: a.label, busy: busy === a.label && 'Saving…', disabled: busy !== null, onClick: () => void run(a) }))

  return (
    <PlaceFrame
      name={name}
      subline={subline}
      position={position}
      switches={switches}
      error={error}
      source={
        <SourceCard name={g.page ? g.page.text.charAt(0).toUpperCase() + g.page.text.slice(1) : 'Its source'} rest={g.when ? ` · ${g.when}` : undefined}>
          {g.page?.url && (
            <a href={g.page.url} target="_blank" rel="noopener noreferrer" className="self-start text-[15px] font-semibold text-primary hover:underline">
              {g.page.text}
            </a>
          )}
        </SourceCard>
      }
      foot={buttons.length > 0 && <PlaceButtons buttons={buttons} />}
    >
      <div className="flex flex-col gap-3" data-testid="todo-waiting">
        {g.lines.map((l) => (
          <section key={l.label} aria-label={l.label} className={`flex items-start gap-3 rounded-2xl border px-4 py-2.5 ${CHANGED}`}>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-extrabold text-slate-900">{l.label}</span>
              <span className="mt-0.5 block text-[14px] leading-snug text-slate-700 [overflow-wrap:anywhere]">{l.value}</span>
              {l.old !== null && <span className="mt-1 block text-[13.5px] text-slate-500 [overflow-wrap:anywhere]">Was {l.old}</span>}
            </span>
            {l.old === null ? <Tag>New</Tag> : <ChangedTag />}
          </section>
        ))}
        {g.boxes?.map((b, i) => (
          <PlaceCard key={i} title={b.name}>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {lit(b).map((r, j) => (
                <li key={j} data-mark={r.mark} className={`-mx-2.5 flex min-h-11.5 items-center gap-2.5 rounded-xl px-2.5 py-1.5 ${r.mark === 'same' ? '' : 'bg-yellow-50'}`}>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15.5px] ${r.mark === 'gone' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{r.name}</span>
                    {(r.sub || r.flag) && (
                      <span className="block text-[13.5px] text-slate-500">
                        {r.sub}
                        {r.flag && <span className="text-amber-800"> · {r.flag}</span>}
                      </span>
                    )}
                  </span>
                  {r.right && <span className="text-right text-[14px] tabular-nums">{r.right}</span>}
                  {r.mark !== 'same' && <Tag>{MARK[r.mark]}</Tag>}
                </li>
              ))}
            </ul>
          </PlaceCard>
        ))}
        {(g.facts.length > 0 || g.note) && (
          <PlaceCard>
            {g.facts.map((x) => (
              <div key={x.label} className="flex flex-col gap-0.5">
                <h2 className="m-0 text-[15px] font-bold text-slate-900">{x.label}</h2>
                <p className="m-0 text-[15px] text-slate-700 [overflow-wrap:anywhere]">
                  {x.url ? (
                    <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {x.value}
                    </a>
                  ) : (
                    x.value
                  )}
                </p>
              </div>
            ))}
            {g.note && <p className="m-0 text-[13.5px] text-slate-500">{g.note}</p>}
          </PlaceCard>
        )}
      </div>
    </PlaceFrame>
  )
}
