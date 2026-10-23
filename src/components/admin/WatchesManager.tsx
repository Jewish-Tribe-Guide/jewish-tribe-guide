'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { MENU_WATCH_CREATOR, watchHealth, type Watch, type WatchCheck } from '@/lib/watches'
import { refuahHospitalId } from '@/lib/refuahWatch'
import { isMekorList } from '@/lib/mekorWatch'
import { isListingPageWatch } from '@/lib/listingPageWatch'
import { groupWatches, watchGroupOf, type WatchGroup, type WatchGroupKey, type WatchRank, type WatchRow } from '@/lib/watchGroups'
import { isIgnoredSender, isNewsletterWatch } from '@/lib/newsletter'
import { WATCH_PURPOSES, purposeInfo, sourceKind, sourceProblem, type ListingReads, type WatchPurpose } from '@/lib/watchPurposes'
import { isHospitalWatch } from '@/lib/refuahMatch'
import { adminBase } from '@/lib/adminNav'
import { dishCounts, hospitalCounts, type DishPlace, type JobCounts } from '@/lib/watchJobs'
import { eruvJobCounts, type EruvJobLoaded } from '@/lib/eruvJob'
import { isEruvWebsiteWatch } from '@/lib/eruvWebsite'
import type { Hospital } from './HospitalsJob'
import type { HoursPlace } from './HoursJob'
import type { KosherLoaded } from './KosherJob'
import { hoursCounts, isHoursOff, isHoursSearched, isStoppedPage } from '@/lib/hoursJob'

// ── The "Watches" tab (freshness map, Oct 5) ────────────────────────────────
// Everything the guide reads on its own to stay current: pages every
// morning, emails as they arrive, eruv statuses on Friday afternoon. Since
// Oct 19 it's laid out by what each keeps current (watchPurposes.ts): "Add a
// watch" asks that first, then the place, then where it's read, and the
// list below is grouped in the same words. A row leads with the place, then
// where it's read from and what it last found; tapping it opens what it
// does and its buttons. What needs the admin (not working, a sender to
// link) shows without opening anything.
//
// Since Oct 21 the tab starts with a row per job (watchJobs.ts), each
// opening a page with every place in it: Dishes (what was the Main dishes
// tab), Hospitals (matched to Refuah on their own, so their watches
// aren't listed here any more), Mikvah hours (read from the pages on
// each one's own website, found on their own) and Shul times (the same,
// for davening times). Since step 5 (Oct 21), Eruv status (moved here
// from the Eruvim tab on Oct 19) and Kosher certification (Keystone-K's and
// Mekor Habracha's lists) are jobs too. The rest are still listed below,
// until each becomes a job of its own.

/** `job`: the job page where what's read for it waits ("Shul times"); none,
 *  the moderation queue. */
type Listing = { id: string; name: string; categoryLabel: string; reads: ListingReads; job?: string | null }
type Loaded = { available: boolean; watches: Watch[]; listings: Listing[] }
type Action = 'check' | 'pause' | 'resume' | 'remove' | 'link' | 'ignore'
type PagesJob = { name: string; places: HoursPlace[] } | null
/** Each job's, as loaded: undefined while it's still loading, null when it
 *  couldn't be. */
type Jobs = {
  dishes?: DishPlace[] | null
  hospitals?: Hospital[] | null
  hours?: PagesJob
  times?: PagesJob
  eruvim?: EruvJobLoaded | null
  kosher?: KosherLoaded | null
}

/** One job's row: what it is and its four counts; the whole row opens its
 *  page. Null counts: they couldn't be loaded; undefined, still loading. */
function JobRow({ href, name, about, counts }: { href: string; name: string; about: string; counts: JobCounts | null | undefined }) {
  const stat = (n: number, label: string, flag: boolean) => (
    <span className="flex min-w-[4.5rem] flex-col">
      <span className={`text-base font-semibold ${flag && n > 0 ? 'text-amber-800' : 'text-slate-900'}`}>{n}</span>
      <span className="text-xs text-muted">{label}</span>
    </span>
  )
  return (
    <li>
      <Link href={href} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 hover:bg-slate-50" data-testid="job-row">
        <span className="min-w-[12rem] flex-1">
          <span className="block font-semibold text-slate-900">{name}</span>
          <span className="block text-sm text-slate-600">{about}</span>
        </span>
        {counts ? (
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {stat(counts.checked, 'checked', false)}
            {stat(counts.toCheck, 'to check', true)}
            {stat(counts.cantRead, 'can’t be read', true)}
            {stat(counts.didntLoad, 'didn’t load today', true)}
          </span>
        ) : counts === null ? (
          <span className="text-sm text-slate-500">Couldn&rsquo;t load its counts.</span>
        ) : (
          <span className="text-sm text-slate-500" data-testid="job-loading">Loading…</span>
        )}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="shrink-0 text-slate-400">
          <path d="M6 4l4 4-4 4" />
        </svg>
      </Link>
    </li>
  )
}

/** A group longer than this starts closed, showing only what needs a look. */
const OPEN_UP_TO = 4
const collapsible = (g: WatchGroup) => g.rows.length > OPEN_UP_TO

const BUTTON = 'rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const INPUT = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm'

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function shortUrl(url: string): string {
  return url.replace(/^mailto:/i, '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
}

function filedText(n: number): string {
  return n === 0 ? 'nothing new' : `${n} suggestion${n === 1 ? '' : 's'} in the queue`
}

type Pill = { tone: 'ok' | 'bad' | 'todo' | 'off'; text: string }
const PILL: Record<Pill['tone'], string> = {
  ok: 'bg-green-50 text-green-800',
  bad: 'bg-red-50 text-red-700',
  todo: 'bg-amber-50 text-amber-800',
  off: 'bg-slate-100 text-slate-600',
}

function PillTag({ pill }: { pill: Pill }) {
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[pill.tone]}`}>{pill.text}</span>
}

function Glyph({ mail }: { mail: boolean }) {
  return mail ? (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="shrink-0">
      <rect x="1.8" y="3.3" width="12.4" height="9.4" rx="1.4" />
      <path d="M2.3 4l5.7 4.6L13.7 4" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4M8 1.8c1.8 1.9 2.6 4 2.6 6.2S9.8 12.3 8 14.2M8 1.8C6.2 3.7 5.4 5.8 5.4 8s.8 4.3 2.6 6.2" />
    </svg>
  )
}

/** Where a watch is read from: its page (a link) or the address its emails
 *  come from. */
function Source({ url }: { url: string | null }) {
  if (!url) return <p className="text-xs text-slate-500">No source yet</p>
  const mail = url.startsWith('mailto:') || !/^https?:/i.test(url)
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
      <Glyph mail={mail} />
      {mail ? (
        <span className="truncate">{shortUrl(url)}</span>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="truncate text-primary underline">
          {shortUrl(url)}
        </a>
      )}
    </p>
  )
}

/** A page the AI reads for the listing: a shul's or mikvah's own. */
function readByAi(w: Watch): boolean {
  return isListingPageWatch(w)
}

/** A watch's state, in a word or two. A page the AI has never read has
 *  only been seen to open, which isn't the same as working (the user,
 *  Oct 20). */
function pillOf(w: Watch, now: number): Pill {
  if (isIgnoredSender(w)) return { tone: 'off', text: 'Skipped' }
  if (isNewsletterWatch(w) && !w.resourceId) return { tone: 'todo', text: 'To link' }
  const h = watchHealth(w, now)
  if (h.state === 'paused') return { tone: 'off', text: 'Paused' }
  if (h.state === 'waiting') return { tone: 'off', text: isNewsletterWatch(w) ? 'No email yet' : 'Not checked yet' }
  if (h.state === 'working') {
    if (readByAi(w) && !w.lastCheck) return { tone: 'off', text: 'Opens · not read yet' }
    if (readByAi(w) && w.lastCheck?.result === 'nothing') return { tone: 'todo', text: 'Reads nothing' }
    if (readByAi(w) && w.lastCheck?.result === 'unsure') return { tone: 'todo', text: 'Needs a look' }
    return { tone: 'ok', text: 'Working' }
  }
  return { tone: 'bad', text: 'Not working' }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What a check found nothing of, by what it reads. */
const NOTHING: Record<WatchCheck['what'], string> = {
  times: 'Found no times on this page',
  hours: 'Found no hours on this page',
  dishes: 'Found no dishes on this menu',
  contacts: 'Refuah has no contacts for this hospital yet',
  list: 'Found no places on the list',
  details: 'Found no hotline or email alerts on this page',
}

/** What became of the differences, in a few words. `where`: where a
 *  filed one waits, for a job page that shows its own ("to check here");
 *  otherwise the queue. */
function queueText(c: WatchCheck, where = 'in the queue'): string {
  if (c.what === 'dishes') return c.queue === 'before' ? 'already on the Main dishes tab, or skipped there' : 'waiting on the Main dishes tab'
  if (c.queue === 'filed') return where
  if (c.queue === 'before') return 'filed before, not again'
  if (c.queue === 'waiting') return 'not filed: the listing already has a suggestion in the queue'
  return ''
}

/** A list's counts: "78 on the list, 74 match the guide, 4 suggestions in
 *  the queue". */
function listText(c: WatchCheck, where = 'in the queue'): string {
  const l = c.list!
  const head = `${l.listed} on the list, ${l.matching} match${l.matching === 1 ? 'es' : ''} the guide`
  if (!l.differences) return `${head}, nothing differs`
  if (l.filed === l.differences) return `${head}, ${plural(l.differences, 'suggestion')} ${where}`
  if (!l.filed) return `${head}, ${l.differences} differ${l.differences === 1 ? 's' : ''}, all filed before`
  return `${head}, ${l.differences} differ: ${plural(l.filed, 'new suggestion')} ${where}, ${l.differences - l.filed} filed before`
}

/** What the last full read found, in one line. `where`: as queueText. */
export function checkLine(c: WatchCheck, where?: string): string {
  if (c.result === 'unreadable') return `${day(c.at)}: the page wouldn’t open`
  if (c.list) return `Read ${day(c.at)}: ${listText(c, where)}`
  if (c.result === 'agrees') return `Read ${day(c.at)}: agrees with the listing`
  if (c.result === 'unsure') return `Read ${day(c.at)}: couldn’t compare it with the listing`
  if (c.result === 'nothing') {
    const n = NOTHING[c.what]
    return `Read ${day(c.at)}: ${c.what === 'contacts' ? n : n[0].toLowerCase() + n.slice(1)}`
  }
  return `Read ${day(c.at)}: ${plural(c.differences.length, 'difference')}, ${queueText(c, where)}`
}

const FROM: Record<NonNullable<WatchCheck['from']>, string> = {
  page: 'the page',
  calendar: 'the page and its calendar',
  pdf: 'the PDF',
  pictures: 'the pictures of its menu',
}

/** What the last full read found, for the opened row: what it read and
 *  from where, then whether that agrees with the listing. */
function CheckResult({ check: c }: { check: WatchCheck }) {
  // A list's counts are on the row; opened, it names the places that
  // differ (kept since Oct 20; older checks kept only the counts).
  if (c.list) {
    if (!c.differences.length) return null
    return (
      <div className="space-y-1.5 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800" data-testid="watch-check">
        <p className="text-xs font-semibold text-slate-600">Where the list differs from the guide, {day(c.at)}</p>
        <ul className="space-y-0.5">
          {c.differences.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <div className="space-y-1.5 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800" data-testid="watch-check">
      {c.result === 'unreadable' ? (
        <p className="font-medium text-red-700">The page wouldn’t open.</p>
      ) : c.read.length ? (
        <>
          <p className="text-xs font-semibold text-slate-600">
            What it read{c.from ? ` from ${FROM[c.from]}` : ''}, {day(c.at)}
          </p>
          <ul className="space-y-0.5">
            {c.read.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {c.more ? <li className="text-xs text-muted">and {c.more} more</li> : null}
          </ul>
        </>
      ) : (
        <p className="font-medium text-amber-800">{NOTHING[c.what]}.</p>
      )}
      {c.result === 'agrees' && <p className="font-medium text-green-800">Agrees with the listing.</p>}
      {c.unread?.length ? (
        <>
          <p className="font-medium text-amber-800">Couldn’t compare with the listing, so nothing was filed for:</p>
          <ul className="space-y-0.5">
            {c.unread.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
      {c.result === 'differs' && (
        <>
          <p className="font-medium text-amber-800">Differs from the listing, {queueText(c)}:</p>
          <ul className="space-y-0.5">
            {c.differences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      {c.note && <p className="text-xs text-muted">{c.note}</p>}
    </div>
  )
}

/** What it last found, in one line. A broken or stale watch says why. */
function LastLine({ watch: w, now }: { watch: Watch; now: number }) {
  const h = watchHealth(w, now)
  if (isIgnoredSender(w)) return <p className="text-sm text-slate-500">Not a shul: its emails are skipped. Remove this to read them again.</p>
  if (h.state === 'stale') return <p className="text-sm font-medium text-red-700">Not checked since {day(h.lastRunAt)}. The daily run may have stopped.</p>
  if (h.state === 'failing') return <p className="text-sm font-medium text-red-700">Not working since {day(h.since)}: {h.error}</p>
  const filed = w.lastFiled !== null ? `: ${filedText(w.lastFiled)}` : ''
  // A newsletter is read when one comes, not checked on a morning.
  if (isNewsletterWatch(w)) return <p className="text-sm text-slate-700">{w.pageChangedAt ? `Newsletter ${day(w.pageChangedAt)}${filed}` : 'No newsletter read yet.'}</p>
  if (h.state === 'waiting') return <p className="text-sm text-slate-500">Not checked yet: the first check is tomorrow morning, or press Check now.</p>
  // What its last full read found, once it has had one.
  if (w.lastCheck && (readByAi(w) || w.lastCheck.list || refuahHospitalId(w.url))) {
    const tone = w.lastCheck.result === 'agrees' ? 'text-slate-700' : w.lastCheck.result === 'unreadable' ? 'text-red-700' : 'text-amber-800'
    return <p className={`text-sm ${tone}`}>{checkLine(w.lastCheck)}</p>
  }
  // Seen to open, never read by the AI: Check now reads it.
  const notRead = <span className="block text-xs text-muted">Not read by the AI yet. Check now reads it and shows what it finds.</span>
  if (isListingPageWatch(w)) {
    return (
      <p className="text-sm text-slate-700">
        {w.pageChangedAt ? `Changed ${day(w.pageChangedAt)}${filed}` : 'No change since it was added.'}
        {notRead}
      </p>
    )
  }
  if (w.kind === 'keystone_list' || isMekorList(w.url) || refuahHospitalId(w.url)) {
    return <p className="text-sm text-slate-700">Read {day(w.lastOkAt ?? w.lastRunAt!)}{filed}</p>
  }
  return w.pageChangedAt ? (
    <p className="text-sm font-semibold text-amber-800">Changed {day(w.pageChangedAt)}: worth a look.</p>
  ) : (
    <p className="text-sm text-slate-700">No change since it was added.</p>
  )
}

/** What a watch does, for the opened row. */
function WhatItDoes({ watch }: { watch: Watch }) {
  if (isIgnoredSender(watch)) return null
  if (isNewsletterWatch(watch)) {
    return (
      <p className="text-xs text-muted" data-testid="newsletter-watch">
        Its newsletters, read as they come in. Changed times, and anything else it says about a place in the guide, wait on the Shul times page with
        the email beside them. You&rsquo;re emailed if none comes for a month.
      </p>
    )
  }
  if (watch.kind === 'keystone_list') {
    return <p className="text-xs text-muted">Compared with the guide every morning. Differences wait on the Kosher certification page, quoting the list.</p>
  }
  if (isMekorList(watch.url)) {
    return (
      <p className="text-xs text-muted" data-testid="mekor-watch">
        Compared with the guide every morning. A place it lists that the guide lacks, and any hechsher the guide shows that it doesn&rsquo;t (IKC
        above all), wait on the Kosher certification page, quoting the list. Nothing is taken off without you.
      </p>
    )
  }
  if (refuahHospitalId(watch.url)) {
    return (
      <p className="text-xs text-muted">
        Compared with the hospital every morning. A new contact, or a changed phone, email or website, waits on the Hospitals page as from Refuah.
      </p>
    )
  }
  if (isListingPageWatch(watch)) {
    return (
      <p className="text-xs text-muted" data-testid="listing-page-watch">
        Checked every morning. When the page changes, the AI reads it, and davening times or hours that differ from the listing go to the
        moderation queue with the page beside them. Check now reads it straight away. A page that agrees changes nothing, not even the listing&rsquo;s date.
      </p>
    )
  }
  return <p className="text-xs text-muted">Checked every morning for a change. You look at the page and decide.</p>
}

/** One row: the place, where it's read from, what it last found, and its
 *  state. Tapping it opens what it does and its buttons. `alwaysShown` is
 *  what needs the admin, shown without opening anything. */
function Row({
  name,
  source,
  pill,
  last,
  alwaysShown,
  children,
  testId,
}: {
  name: string
  source: React.ReactNode
  pill: Pill
  last: React.ReactNode
  alwaysShown?: React.ReactNode
  children?: React.ReactNode
  testId: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className="px-4 py-3" data-testid={testId}>
      {children ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="block w-full cursor-pointer text-left">
          <RowHead name={name} source={source} pill={pill} last={last} open={open} />
        </button>
      ) : (
        <RowHead name={name} source={source} pill={pill} last={last} />
      )}
      {alwaysShown}
      {open && children && <div className="mt-2 space-y-2">{children}</div>}
    </li>
  )
}

function RowHead({ name, source, pill, last, open }: { name: string; source: React.ReactNode; pill: Pill; last: React.ReactNode; open?: boolean }) {
  return (
    <span className="flex items-start gap-3">
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block font-semibold text-slate-900" data-testid="watch-name">{name}</span>
        {source}
        {last}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <PillTag pill={pill} />
        {open !== undefined && (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={`text-slate-400 ${open ? 'rotate-180' : ''}`}>
            <path d="M4 6l4 4 4-4" />
          </svg>
        )}
      </span>
    </span>
  )
}

/** One group: a heading that says how many and what needs doing, and its
 *  rows. A long group starts closed, but a row that needs a look (or one
 *  acted on this visit) shows anyway. */
function GroupSection({
  label,
  total,
  needs,
  collapsibleGroup,
  open,
  onToggle,
  children,
}: {
  label: string
  total: number
  needs: string | null
  collapsibleGroup: boolean
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const heading = (
    <>
      <span className="font-semibold text-slate-900">{label}</span> <span className="text-slate-500">{total}</span>{' '}
      {needs ? (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{needs}</span>
      ) : total > 0 ? (
        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-800">All working</span>
      ) : null}
    </>
  )
  return (
    <section className="rounded-lg border border-slate-200 bg-white" data-testid="watch-group" aria-label={label}>
      <h3 className="text-sm">
        {collapsibleGroup ? (
          <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3 text-left hover:bg-slate-50">
            {heading} <span className="ml-auto text-xs font-medium text-primary">{open ? 'Hide' : `Show all ${total}`}</span>
          </button>
        ) : (
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3">{heading}</span>
        )}
      </h3>
      {children}
    </section>
  )
}

/** A newsletter sender no one has tied to its shul yet: pick the shul, or
 *  say it isn't one. */
function NewsletterLink({ listings, busy, onLink, onIgnore }: { listings: Listing[]; busy: boolean; onLink: (id: string) => void; onIgnore: () => void }) {
  const [name, setName] = useState('')
  const listing = listings.find((l) => l.name === name.trim())
  return (
    <div className="mt-2 space-y-2" data-testid="newsletter-unlinked">
      <p className="text-sm font-medium text-amber-800">Not linked to a shul yet. Its emails wait in the guide&rsquo;s inbox until it is.</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          list="watch-listings"
          aria-label="The shul it’s from"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The shul it’s from"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button type="button" disabled={busy || !listing} onClick={() => listing && onLink(listing.id)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          Link
        </button>
        <button type="button" disabled={busy} onClick={onIgnore} className={BUTTON}>
          Not a shul
        </button>
      </div>
    </div>
  )
}

/** What "Add a watch" says will happen, once it knows enough to say. */
function planFor(purpose: AddPurpose, source: string, place: string | null, job: string | null): { main: string; small: string } {
  const s = shortUrl(source.trim())
  const p = place ?? 'the listing'
  const email = sourceKind(source) === 'email'
  // Step 6: what a job reads waits on its page, beside the listing.
  const goes = job ? `wait on the ${job} page, beside what the listing says` : 'go to the moderation queue, with the page beside them'
  switch (purpose) {
    case 'times':
      return email
        ? { main: `Each newsletter from ${s} is read as it arrives, for that week’s times and anything else it says about ${p}. What differs ${job ? `waits on the ${job} page, beside what the listing says` : 'goes to the moderation queue with the email beside it'}.`, small: 'The guide’s Gmail must be on the shul’s list. You’re emailed if none comes for a month.' }
        : { main: `Every morning the guide reads ${s}, and its calendar if it has one. Times that differ from ${p}’s ${goes}; a calendar is read a week at a time, and its week goes as this week’s schedule.`, small: 'A page that agrees changes nothing. Where the newsletter has given that week’s times, the newsletter wins.' }
    case 'hours':
      return { main: `Every morning the guide reads ${s}. Hours that differ from ${p}’s ${goes}.`, small: 'A page that agrees changes nothing.' }
    case 'hospital':
      return { main: `Every morning Refuah’s contacts for ${p} are compared with the listing. A new or changed phone, email or website waits on the Hospitals page, beside what the listing says.`, small: 'When Refuah agrees, the listing is dated as confirmed by Refuah.' }
    default:
      return { main: `Every morning the guide checks ${s}, and marks its row when the page changes.`, small: 'It reads nothing into it: you look and decide.' }
  }
}

/** What "Add a watch" offers. An eruv's status and a kosher list are set on
 *  their own job pages (EruvJob, KosherJob). */
type AddPurpose = Exclude<WatchPurpose, 'eruv' | 'kosher'>
const ON_A_JOB_PAGE: readonly WatchPurpose[] = ['eruv', 'kosher']

const SOURCE_HELP: Record<AddPurpose, string> = {
  times: 'The shul’s own page of davening times or its calendar, or the address its newsletter comes from.',
  hours: 'The place’s own page of hours: a mikvah’s, or any place with hours.',
  menu: '',
  hospital: 'The hospital’s own page on Refuah (refuah.com/hospitals/…).',
  other: 'Any page you want to hear about when it changes.',
}

/** "Add a watch": what it keeps current, then the place, then where it's
 *  read from, then what will happen. */
function AddWatch({
  listings,
  busy,
  onAdd,
  onCancel,
}: {
  listings: Listing[]
  busy: boolean
  onAdd: (a: { purpose: AddPurpose; source: string; listing: Listing | null }) => Promise<boolean>
  onCancel: () => void
}) {
  const [purpose, setPurpose] = useState<AddPurpose | null>(null)
  const [placeName, setPlaceName] = useState('')
  const [source, setSource] = useState('')
  const [error, setError] = useState<string | null>(null)
  const info = purpose ? purposeInfo(purpose) : null
  const choices = info?.placeReads ? listings.filter((l) => l.reads === info.placeReads) : listings
  const listing = info?.place === 'listing' ? (choices.find((l) => l.name === placeName.trim()) ?? null) : null
  const kind = sourceKind(source)
  const problem = purpose && source.trim() ? sourceProblem(purpose, source) : null
  const ready = !!purpose && !!source.trim() && !problem && (info?.place !== 'listing' || !!listing)
  const plan = purpose && source.trim() && !problem ? planFor(purpose, source, listing?.name ?? null, purpose === 'hospital' ? null : (listing?.job ?? null)) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!purpose) return
    if (info?.place === 'listing' && !listing) return setError(`Pick the ${purpose === 'times' ? 'shul' : 'place'} from the list.`)
    if (problem) return setError(problem)
    setError(null)
    await onAdd({ purpose, source, listing })
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="add-watch-title" data-testid="add-watch">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="add-watch-title" className="text-base font-semibold text-slate-900">
          Add a watch
        </h2>
        <button type="button" onClick={onCancel} className={BUTTON}>
          Cancel
        </button>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-800">What should it keep current?</legend>
        <div className="flex flex-wrap gap-2">
          {WATCH_PURPOSES.filter((p) => p.addable && !ON_A_JOB_PAGE.includes(p.key)).map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={purpose === p.key}
              onClick={() => {
                setPurpose(p.key as AddPurpose)
                setPlaceName('')
                setError(null)
              }}
              className={`rounded-full border px-3 py-1.5 text-sm ${purpose === p.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      {purpose && info && (
        <>
          {info.place === 'listing' && (
            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Which place?</span>
              <input type="text" list="watch-add-places" value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="Start typing a name" className={INPUT} />
              <datalist id="watch-add-places">
                {choices.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.categoryLabel}
                  </option>
                ))}
              </datalist>
            </label>
          )}
          <label className="block text-sm">
            <span className="font-semibold text-slate-800">Where does the guide read it?</span>
            <input
              type="text"
              // A web address or an email address: a keyboard with both / and @.
              inputMode={info.source === 'either' ? 'text' : 'url'}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={info.source === 'either' ? 'A web address, or an email address' : 'A web address'}
              className={INPUT}
            />
            <span className="mt-1 block text-xs text-muted">{SOURCE_HELP[purpose]}</span>
            {problem ? (
              <span className="mt-1 block text-xs font-medium text-red-700">{problem}</span>
            ) : kind ? (
              <span className="mt-1 block text-xs font-medium text-green-800">{kind === 'email' ? 'An email address: read as each email arrives.' : 'A web page.'}</span>
            ) : null}
          </label>
          {plan && (
            <div className="space-y-1 rounded-md bg-amber-50/60 px-3 py-2.5 text-sm text-slate-800" data-testid="add-watch-plan">
              <p>{plan.main}</p>
              <p className="text-xs text-muted">{plan.small}</p>
            </div>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy || !ready} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? 'Checking…' : 'Start watching'}
            </button>
            <span className="text-xs text-muted">A page is checked once straight away, so you&rsquo;ll see at once whether the guide can read it.</span>
          </div>
        </>
      )}
    </form>
  )
}

/** What the tab last showed, per community, so coming back to it (from a
 *  job's page) shows that at once while it's read again, rather than
 *  "Loading watches…" every time (the user, Oct 22). */
const lastSeen = new Map<string, { data: Loaded; jobs: Jobs }>()
const NO_JOBS: Jobs = {}

/** For tests: start from nothing. */
export function forgetWatchesTab() {
  lastSeen.clear()
}

export default function WatchesManager({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(() => lastSeen.get(community)?.data ?? null)
  const [jobs, setJobs] = useState<Jobs>(() => lastSeen.get(community)?.jobs ?? NO_JOBS)
  // The list waits for the hours and shul times jobs, which take their
  // places' pages out of it, so rows don't show and then go.
  const [listReady, setListReady] = useState(() => lastSeen.has(community))
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // Read once per render pass for every row alike; the tab is reloaded to refresh.
  const [now] = useState(() => Date.now())
  // Long groups the admin has opened, and the rows they've acted on.
  const [opened, setOpened] = useState<ReadonlySet<WatchGroupKey>>(new Set())
  const [kept, setKept] = useState<ReadonlyMap<string, WatchRank>>(new Map())
  const toggle = (key: WatchGroupKey) =>
    setOpened((o) => {
      const next = new Set(o)
      if (!next.delete(key)) next.add(key)
      return next
    })
  const auth = { Authorization: `Bearer ${token}` }

  const load = useCallback(async () => {
    setError(null)
    const headers = { Authorization: `Bearer ${token}` }
    // The jobs' counts are a part of the tab, not the whole: each fills in
    // as its own read comes back, and the list doesn't wait for them. One
    // that fails keeps what it last showed.
    const get = <T,>(path: string) => fetchJson<T>(withCommunity(path, community), { headers }, '').catch(() => null)
    const fill = <K extends keyof Jobs>(key: K, value: Jobs[K]) => setJobs((j) => ({ ...j, [key]: value }))
    const failed = (key: keyof Jobs) => setJobs((j) => (j[key] === undefined ? { ...j, [key]: null } : j))
    const job = (j: { name: string; places: HoursPlace[] }): PagesJob => (j.places ? { name: j.name, places: j.places } : null)
    void get<{ places: DishPlace[] }>('/api/admin/main-dishes').then((d) => (d ? fill('dishes', d.places ?? null) : failed('dishes')))
    void get<{ hospitals: Hospital[] }>('/api/admin/watches/hospitals?counts').then((d) => (d ? fill('hospitals', d.hospitals ?? null) : failed('hospitals')))
    const hours = get<{ name: string; places: HoursPlace[] }>('/api/admin/watches/hours?counts').then((d) => (d ? fill('hours', job(d)) : failed('hours')))
    const times = get<{ name: string; places: HoursPlace[] }>('/api/admin/watches/hours?counts&job=times').then((d) => (d ? fill('times', job(d)) : failed('times')))
    void Promise.all([hours, times]).then(() => setListReady(true))
    void get<EruvJobLoaded>('/api/admin/watches/eruv').then((d) => (d ? fill('eruvim', d.available ? d : null) : failed('eruvim')))
    void get<KosherLoaded>('/api/admin/watches/kosher').then((d) => (d ? fill('kosher', d.lists ? d : null) : failed('kosher')))
    try {
      setData(await fetchJson<Loaded>(withCommunity('/api/admin/watches', community), { headers }, 'Failed to load the watches.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useEffect(() => {
    if (data) lastSeen.set(community, { data, jobs })
  }, [community, data, jobs])

  useLoadOnMount(load)

  const post = <T,>(path: string, body: unknown) =>
    fetchJson<T>(withCommunity(path, community), { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'Could not do that.')

  async function actOn(watch: Watch, action: Action, resourceId?: string) {
    if (action === 'remove' && !window.confirm(`Stop watching ${shortUrl(watch.url)}?`)) return
    setSaveError(null)
    setBusy(watch.id)
    try {
      const res = await post<{ watch?: Watch }>('/api/admin/watches', { action, id: watch.id, ...(resourceId ? { resourceId } : {}) })
      setData((d) =>
        d && {
          ...d,
          watches: action === 'remove' ? d.watches.filter((w) => w.id !== watch.id) : d.watches.map((w) => (w.id === watch.id && res.watch ? res.watch : w)),
        },
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  async function add(a: { purpose: AddPurpose; source: string; listing: Listing | null }): Promise<boolean> {
    setSaveError(null)
    setBusy('add')
    try {
      const res = await post<{ watch?: Watch }>('/api/admin/watches', { action: 'add', purpose: a.purpose, url: a.source.trim(), resourceId: a.listing?.id ?? null })
      if (res.watch) {
        const added = res.watch
        setData((d) => d && { ...d, watches: [...d.watches, added] })
        // Show it, even when its group is a long, closed one.
        setOpened((o) => new Set(o).add(watchGroupOf(added, readsOf)))
        setKept((k) => new Map(k).set(added.id, 2))
      }
      setAdding(false)
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not add that.')
      return false
    } finally {
      setBusy(null)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!data) return <p className="text-sm text-muted">Loading watches…</p>

  const listings = data.listings
  const listingOf = new Map(listings.map((l) => [l.id, l]))
  const readsOf = (id: string) => listingOf.get(id)?.reads ?? null
  // Acting on a row keeps it where it was (watchGroups.ts).
  const act = (row: WatchRow, action: Action, resourceId?: string) => {
    setKept((k) => (k.has(row.watch.id) ? k : new Map(k).set(row.watch.id, row.rank)))
    void actOn(row.watch, action, resourceId)
  }

  // A hospital's Refuah page is on the Hospitals page, a mikvah's hours
  // pages on the hours page, a shul's pages on the Shul times page, and
  // the kosher lists on the Kosher certification page, an eruv's website
  // on Eruv status, and a food place's menu watch on Main dishes.
  const jobIds = new Set([...(jobs.hours?.places ?? []), ...(jobs.times?.places ?? [])].map((p) => p.id))
  const shulIds = new Set((jobs.times?.places ?? []).map((p) => p.id))
  const listed = data.watches.filter(
    (w) =>
      !isHospitalWatch(w) &&
      !isHoursOff(w) &&
      !isHoursSearched(w) &&
      !isStoppedPage(w) &&
      watchGroupOf(w) !== 'kosher' &&
      !isEruvWebsiteWatch(w) &&
      w.createdBy !== MENU_WATCH_CREATOR &&
      !(w.resourceId && jobIds.has(w.resourceId) && isListingPageWatch(w)) &&
      // A linked shul's newsletter is one of its reads on Shul times (the
      // user, Oct 22); one linked this visit stays in view.
      !(w.resourceId && shulIds.has(w.resourceId) && isNewsletterWatch(w) && !isIgnoredSender(w) && !kept.has(w.id)),
  )
  const groups = data.available && listReady ? groupWatches(listed, now, kept, readsOf) : []
  const counted = listed.filter((w) => !isIgnoredSender(w)).length
  const base = adminBase(community)
  // As the Hospitals page counts them: a finding waiting there is to check.
  const hospitalStates = jobs.hospitals?.map((h) => ({ ...h, waiting: h.findings?.length }))
  const hospitalsNothing = hospitalStates ? hospitalCounts(hospitalStates, now).nothing : 0
  const needs = groups.reduce((n, g) => n + g.counts.notWorking + g.counts.toLink, 0)

  function renderRow(row: WatchRow) {
    const w = row.watch
    const listing = w.resourceId ? listingOf.get(w.resourceId) : null
    const unlinked = isNewsletterWatch(w) && !w.resourceId
    const ignored = isIgnoredSender(w)
    return (
      <Row
        key={w.id}
        testId="watch-row"
        name={listing?.name ?? w.label ?? shortUrl(w.url)}
        source={<Source url={w.url} />}
        pill={pillOf(w, now)}
        last={unlinked ? null : <LastLine watch={w} now={now} />}
        alwaysShown={unlinked && <NewsletterLink listings={listings} busy={busy !== null} onLink={(id) => act(row, 'link', id)} onIgnore={() => act(row, 'ignore')} />}
      >
        <WhatItDoes watch={w} />
        {w.lastCheck && <CheckResult check={w.lastCheck} />}
        {listing && w.label && w.label !== listing.name && <p className="text-xs text-slate-600">Named: {w.label}</p>}
        <div className="flex flex-wrap gap-2">
          {!unlinked && !ignored && (
            <>
              <button type="button" disabled={busy !== null || !w.active} onClick={() => act(row, 'check')} className={BUTTON}>
                {busy === w.id ? (readByAi(w) ? 'Reading…' : 'Checking…') : 'Check now'}
              </button>
              <button type="button" disabled={busy !== null} onClick={() => act(row, w.active ? 'pause' : 'resume')} className={BUTTON}>
                {w.active ? 'Pause' : 'Resume'}
              </button>
            </>
          )}
          <button type="button" disabled={busy !== null} onClick={() => act(row, 'remove')} className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
            Remove
          </button>
        </div>
      </Row>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        What the guide reads on its own to stay current: pages every morning, emails as they arrive. <strong>What it finds waits on each job&rsquo;s page, beside what the listing says, for you to update or skip</strong>; a page no job reads goes to the moderation queue, and an eruv&rsquo;s status shows at once. If a watch stops working, you&rsquo;re emailed once, and again when it works.
      </p>
      <section className="rounded-lg border border-slate-200 bg-white" aria-label="Jobs">
        <ul className="divide-y divide-slate-100">
          <JobRow
            href={`${base}/watches/dishes`}
            name="Dishes"
            about={jobs.dishes ? `${jobs.dishes.length} food places, from their menus` : 'Food places, from their menus'}
            counts={jobs.dishes && dishCounts(jobs.dishes, now)}
          />
          <JobRow
            href={`${base}/watches/hospitals`}
            name="Hospitals"
            about={
              jobs.hospitals
                ? `${jobs.hospitals.length} hospital${jobs.hospitals.length === 1 ? '' : 's'}, from Refuah${hospitalsNothing ? ` · ${hospitalsNothing} with nothing there yet` : ''}`
                : 'Hospitals, from Refuah'
            }
            counts={hospitalStates ? hospitalCounts(hospitalStates, now) : jobs.hospitals === undefined ? undefined : null}
          />
          {jobs.hours && jobs.hours.places.length > 0 && (
            <JobRow
              href={`${base}/watches/hours`}
              name={jobs.hours.name}
              about={`${jobs.hours.places.length} place${jobs.hours.places.length === 1 ? '' : 's'}, from their websites`}
              counts={hoursCounts(jobs.hours.places.map((p) => ({ pages: p.pages.map((x) => x.watch), off: p.off, waiting: p.findings?.length, decidedAt: p.decided?.at, newsletters: p.newsletters })), now)}
            />
          )}
          {jobs.times && jobs.times.places.length > 0 && (
            <JobRow
              href={`${base}/watches/times`}
              name={jobs.times.name}
              about={`${jobs.times.places.length} shul${jobs.times.places.length === 1 ? '' : 's'}, from their websites`}
              counts={hoursCounts(jobs.times.places.map((p) => ({ pages: p.pages.map((x) => x.watch), off: p.off, waiting: p.findings?.length, decidedAt: p.decided?.at, newsletters: p.newsletters })), now)}
            />
          )}
          <JobRow
            href={`${base}/watches/eruv`}
            name="Eruv status"
            about={
              jobs.eruvim
                ? `${jobs.eruvim.eruvim.length} eruv${jobs.eruvim.eruvim.length === 1 ? '' : 'im'}. Status goes live on its own; its website’s hotline and email alerts wait here`
                : 'Eruvim. Status goes live on its own; its website’s hotline and email alerts wait here'
            }
            counts={jobs.eruvim && eruvJobCounts(jobs.eruvim, new Date(now))}
          />
          <JobRow
            href={`${base}/watches/kosher`}
            name="Kosher certification"
            about={jobs.kosher ? `${jobs.kosher.places.length} food places, from Keystone-K’s and Mekor Habracha’s lists` : 'Food places, from Keystone-K’s and Mekor Habracha’s lists'}
            counts={jobs.kosher && jobs.kosher.counts}
          />
        </ul>
      </section>
      {!data.available && (
        <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
          Keeping a watch here needs database migration 070. Until it&rsquo;s run, Keystone-K&rsquo;s list is still read every morning.
        </p>
      )}

      {data.available && !listReady && <p className="text-sm text-muted">Loading watches…</p>}
      {data.available && listReady && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-800" data-testid="watch-summary">
            <strong>{counted} watches</strong> · {needs === 0 ? 'all working' : <span className="font-semibold text-amber-800">{needs} need{needs === 1 ? 's' : ''} you</span>}
          </p>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
              Add a watch
            </button>
          )}
        </div>
      )}
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}

      {data.available && adding && (
        <AddWatch listings={listings} busy={busy !== null} onAdd={add} onCancel={() => setAdding(false)} />
      )}

      {groups.map((g) => {
        const open = !collapsible(g) || opened.has(g.key)
        const shown = open ? g.rows : g.rows.filter((r) => r.needsLook || r.keepShown)
        const { toLink, notWorking, paused } = g.counts
        const parts = [toLink && `${toLink} to link`, notWorking && `${notWorking} not working`, paused && `${paused} paused`].filter(Boolean)
        return (
          <GroupSection
            key={g.key}
            label={g.label}
            total={g.rows.length}
            needs={parts.length ? parts.join(' · ') : null}
            collapsibleGroup={collapsible(g)}
            open={open}
            onToggle={() => toggle(g.key)}
          >
            {shown.length > 0 && <ul className="divide-y divide-slate-100 border-t border-slate-100">{shown.map(renderRow)}</ul>}
          </GroupSection>
        )
      })}
      {data.available && data.watches.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-muted">Nothing watched yet. Add a watch to start.</p>
      )}

      <datalist id="watch-listings">
        {listings.map((l) => (
          <option key={l.id} value={l.name}>
            {l.categoryLabel}
          </option>
        ))}
      </datalist>
    </div>
  )
}
