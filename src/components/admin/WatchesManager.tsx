'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { MENU_WATCH_CREATOR, kindForUrl, normalizeWatchUrl, watchHealth, type Watch, type WatchCheck } from '@/lib/watches'
import { refuahHospitalId } from '@/lib/refuahWatch'
import { isMekorList } from '@/lib/mekorWatch'
import { isListingPageWatch } from '@/lib/listingPageWatch'
import { groupWatches, watchGroupOf, type WatchGroup, type WatchGroupKey, type WatchRank, type WatchRow } from '@/lib/watchGroups'
import { isIgnoredSender, isNewsletterWatch } from '@/lib/newsletter'
import { WATCH_PURPOSES, purposeInfo, sourceKind, sourceProblem, type ListingReads, type WatchPurpose } from '@/lib/watchPurposes'
import { eruvView } from '@/lib/eruv'
import type { AdminEruv } from '@/lib/eruvStore'
import { isHospitalWatch } from '@/lib/refuahMatch'
import { adminBase } from '@/lib/adminNav'
import { dishCounts, hospitalCounts, type DishPlace, type JobCounts } from '@/lib/watchJobs'
import type { Hospital } from './HospitalsJob'
import type { HoursPlace } from './HoursJob'
import { hoursCounts, isHoursOff } from '@/lib/hoursJob'
import EruvKeptEmail from './EruvKeptEmail'

// ── The "Watches" tab (freshness map, Oct 5) ────────────────────────────────
// Everything the guide reads on its own to stay current: pages every
// morning, emails as they arrive, eruv statuses on Friday afternoon. Since
// Oct 19 it's laid out by what each keeps current (watchPurposes.ts): "Add a
// watch" asks that first, then the place, then where it's read, and the
// list below is grouped in the same words. A row leads with the place, then
// where it's read from and what it last found; tapping it opens what it
// does and its buttons. What needs the admin (not working, a sender to link,
// an email to read, an eruv with no source) shows without opening anything.
//
// Eruv status moved here from the Eruvim tab (the user, Oct 19): an eruv's
// source is its status page or status email, kept on the eruv
// (/api/admin/eruvim), listed here first.
//
// Since Oct 21 the tab starts with a row per job (watchJobs.ts), each
// opening a page with every place in it: Dishes (what was the Main dishes
// tab), Hospitals (matched to Refuah on their own, so their watches
// aren't listed here any more) and Mikvah hours (read from the pages on
// each one's own website, found on their own). The rest are still listed below, until each
// becomes a job of its own.

type Listing = { id: string; name: string; categoryLabel: string; reads: ListingReads }
type Loaded = { available: boolean; watches: Watch[]; listings: Listing[] }
type Eruvim = { available: boolean; timezone: string; eruvim: AdminEruv[] }
type Action = 'check' | 'pause' | 'resume' | 'remove' | 'link' | 'ignore'
type Jobs = { dishes: DishPlace[] | null; hospitals: Hospital[] | null; hours: { name: string; places: HoursPlace[] } | null }

/** One job's row: what it is and its four counts; the whole row opens its
 *  page. Null counts: they couldn't be loaded. */
function JobRow({ href, name, about, counts }: { href: string; name: string; about: string; counts: JobCounts | null }) {
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
        ) : (
          <span className="text-sm text-slate-500">Couldn&rsquo;t load its counts.</span>
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

/** A page the AI reads for the listing: a shul's or mikvah's own, or a
 *  menu. */
function readByAi(w: Watch): boolean {
  return isListingPageWatch(w) || w.createdBy === MENU_WATCH_CREATOR
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
}

/** What became of the differences, in a few words. */
function queueText(c: WatchCheck): string {
  if (c.what === 'dishes') return c.queue === 'before' ? 'already on the Main dishes tab, or skipped there' : 'waiting on the Main dishes tab'
  if (c.queue === 'filed') return 'in the queue'
  if (c.queue === 'before') return 'filed before, not again'
  if (c.queue === 'waiting') return 'not filed: the listing already has a suggestion in the queue'
  return ''
}

/** A list's counts: "78 on the list, 74 match the guide, 4 suggestions in
 *  the queue". */
function listText(c: WatchCheck): string {
  const l = c.list!
  const head = `${l.listed} on the list, ${l.matching} match${l.matching === 1 ? 'es' : ''} the guide`
  if (!l.differences) return `${head}, nothing differs`
  if (l.filed === l.differences) return `${head}, ${plural(l.differences, 'suggestion')} in the queue`
  if (!l.filed) return `${head}, ${l.differences} differ${l.differences === 1 ? 's' : ''}, all filed before`
  return `${head}, ${l.differences} differ: ${plural(l.filed, 'new suggestion')} in the queue, ${l.differences - l.filed} filed before`
}

/** What the last full read found, in one line. */
function checkLine(c: WatchCheck): string {
  if (c.result === 'unreadable') return `${day(c.at)}: the page wouldn’t open`
  if (c.list) return `Read ${day(c.at)}: ${listText(c)}`
  if (c.result === 'agrees') return `Read ${day(c.at)}: agrees with the listing`
  if (c.result === 'unsure') return `Read ${day(c.at)}: couldn’t compare it with the listing`
  if (c.result === 'nothing') {
    const n = NOTHING[c.what]
    return `Read ${day(c.at)}: ${c.what === 'contacts' ? n : n[0].toLowerCase() + n.slice(1)}`
  }
  return `Read ${day(c.at)}: ${plural(c.differences.length, 'difference')}, ${queueText(c)}`
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
  if (w.createdBy === MENU_WATCH_CREATOR) {
    return (
      <p className="text-sm text-slate-700">
        {w.pageChangedAt ? `Changed ${day(w.pageChangedAt)}${w.lastFiled ? ': new dishes on the Main dishes tab' : ''}` : 'No change since it was added.'}
        {notRead}
      </p>
    )
  }
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
        Its newsletters, read as they come in. Changed times, and anything else it says about a place in the guide, go to the moderation queue with the
        email beside them. You&rsquo;re emailed if none comes for a month.
      </p>
    )
  }
  if (watch.kind === 'keystone_list') {
    return <p className="text-xs text-muted">Compared with the guide every morning. Differences go to the moderation queue, quoting the list.</p>
  }
  if (isMekorList(watch.url)) {
    return (
      <p className="text-xs text-muted" data-testid="mekor-watch">
        Compared with the guide every morning. A place it lists that the guide lacks, and any hechsher the guide shows that it doesn&rsquo;t (IKC
        above all), go to the moderation queue, quoting the list. Nothing is taken off without you.
      </p>
    )
  }
  if (refuahHospitalId(watch.url)) {
    return (
      <p className="text-xs text-muted">
        Compared with the hospital every morning. A new contact, or a changed phone, email or website, goes to the moderation queue as from Refuah.
      </p>
    )
  }
  if (watch.createdBy === MENU_WATCH_CREATOR) {
    return (
      <p className="text-xs text-muted" data-testid="menu-watch">
        Its menu, checked every morning: its menu link, or the page the reader found its menu on. When the menu changes, the AI reads it, and dishes the listing doesn’t have wait on the Main dishes tab. If the page stops opening, its website is searched again, and a menu found on another page waits there too. Check now reads it straight away. Added for every place whose menu is known: pause it to stop it.
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
  note,
  collapsibleGroup,
  open,
  onToggle,
  children,
}: {
  label: string
  total: number
  needs: string | null
  note?: string
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
      {note && <p className="px-4 pb-3 text-xs text-muted">{note}</p>}
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

/** An eruv's state as a watch: no source, can't be read, an email to
 *  read, or working. */
function eruvPill(e: AdminEruv): Pill {
  if (!e.statusUrl && !e.statusEmail) return { tone: 'todo', text: 'No source' }
  if (e.statusEmailKept) return { tone: 'todo', text: 'Email to read' }
  if (e.statusUrl && e.statusErrorAt && (!e.statusCheckedAt || Date.parse(e.statusErrorAt) > Date.parse(e.statusCheckedAt))) return { tone: 'bad', text: 'Not working' }
  return { tone: 'ok', text: 'Working' }
}

/** What "Add a watch" says will happen, once it knows enough to say. */
function planFor(purpose: WatchPurpose, source: string, place: string | null): { main: string; small: string } {
  const s = shortUrl(source.trim())
  const p = place ?? 'the listing'
  const email = sourceKind(source) === 'email'
  switch (purpose) {
    case 'eruv':
      return email
        ? { main: `Each email from ${s} is read for “up” or “down” and shown on ${p} at once, through that week’s Shabbos.`, small: 'The guide’s Gmail must get its emails. One it can’t make out waits for you on its row.' }
        : { main: `The guide reads ${s} every 15 minutes on Friday afternoon, and shows ${p}’s status at once.`, small: 'It never sets a status itself: a page it can’t make out shows no status.' }
    case 'times':
      return email
        ? { main: `Each newsletter from ${s} is read as it arrives, for that week’s times and anything else it says about ${p}. What differs goes to the moderation queue with the email beside it.`, small: 'The guide’s Gmail must be on the shul’s list. You’re emailed if none comes for a month.' }
        : { main: `Every morning the guide reads ${s}, and its calendar if it has one. Times that differ from ${p}’s go to the moderation queue, with the page beside them; a calendar is read a week at a time, and its week goes as this week’s schedule.`, small: 'A page that agrees changes nothing. Where the newsletter has given that week’s times, the newsletter wins.' }
    case 'hours':
      return { main: `Every morning the guide reads ${s}. Hours that differ from ${p}’s go to the moderation queue, with the page beside them.`, small: 'A page that agrees changes nothing.' }
    case 'kosher': {
      const url = normalizeWatchUrl(source)
      return url && (kindForUrl(url) === 'keystone_list' || isMekorList(url))
        ? { main: 'Every morning the list is compared with the guide, place by place. Differences go to the moderation queue, quoting the list.', small: 'Nothing is taken off the site without you.' }
        : { main: `Every morning the guide checks ${s}, and marks its row when it changes.`, small: 'The guide reads a list place by place only once it has learned that list, as it has Keystone-K’s and Mekor Habracha’s. Until then it tells you the page changed.' }
    }
    case 'hospital':
      return { main: `Every morning Refuah’s contacts for ${p} are compared with the listing. A new or changed phone, email or website goes to the moderation queue.`, small: 'When Refuah agrees, the listing is dated as confirmed by Refuah.' }
    default:
      return { main: `Every morning the guide checks ${s}, and marks its row when the page changes.`, small: 'It reads nothing into it: you look and decide.' }
  }
}

const SOURCE_HELP: Record<WatchPurpose, string> = {
  eruv: 'The eruv’s status page, or the address its “The eruv is up” emails come from (a mailing list’s own address, …@groups.io, for a list).',
  times: 'The shul’s own page of davening times or its calendar, or the address its newsletter comes from.',
  hours: 'The place’s own page of hours: a mikvah’s, or any place with hours.',
  kosher: 'A hechsher’s list of the places it supervises.',
  menu: '',
  hospital: 'The hospital’s own page on Refuah (refuah.com/hospitals/…).',
  other: 'Any page you want to hear about when it changes.',
}

/** "Add a watch": what it keeps current, then the place, then where it's
 *  read from, then what will happen. */
function AddWatch({
  listings,
  eruvim,
  start,
  busy,
  onAdd,
  onCancel,
}: {
  listings: Listing[]
  eruvim: AdminEruv[] | null
  start: { purpose: WatchPurpose; eruvId?: string } | null
  busy: boolean
  onAdd: (a: { purpose: WatchPurpose; source: string; listing: Listing | null; eruv: AdminEruv | null; statusDated: boolean }) => Promise<boolean>
  onCancel: () => void
}) {
  const [purpose, setPurpose] = useState<WatchPurpose | null>(start?.purpose ?? null)
  const [placeName, setPlaceName] = useState('')
  const [eruvId, setEruvId] = useState(start?.eruvId ?? '')
  const [source, setSource] = useState('')
  const [statusDated, setStatusDated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const info = purpose ? purposeInfo(purpose) : null
  const choices = info?.placeReads ? listings.filter((l) => l.reads === info.placeReads) : listings
  const listing = info?.place === 'listing' ? (choices.find((l) => l.name === placeName.trim()) ?? null) : null
  const eruv = info?.place === 'eruv' ? (eruvim?.find((e) => e.id === eruvId) ?? null) : null
  const placeLabel = info?.place === 'eruv' ? eruv?.name ?? null : listing?.name ?? null
  const kind = sourceKind(source)
  const problem = purpose && source.trim() ? sourceProblem(purpose, source) : null
  const ready = !!purpose && !!source.trim() && !problem && (info?.place === null || (info?.place === 'listing' ? !!listing : !!eruv))
  const plan = purpose && source.trim() && !problem ? planFor(purpose, source, placeLabel) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!purpose) return
    if (info?.place === 'listing' && !listing) return setError(`Pick the ${purpose === 'times' ? 'shul' : 'place'} from the list.`)
    if (info?.place === 'eruv' && !eruv) return setError('Pick the eruv.')
    if (problem) return setError(problem)
    setError(null)
    await onAdd({ purpose, source, listing, eruv, statusDated })
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
          {WATCH_PURPOSES.filter((p) => p.addable).map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={purpose === p.key}
              onClick={() => {
                setPurpose(p.key)
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
          {info.place === 'eruv' && (
            <label className="block text-sm">
              <span className="font-semibold text-slate-800">Which eruv?</span>
              <select value={eruvId} onChange={(e) => setEruvId(e.target.value)} className={INPUT}>
                <option value="">Pick one</option>
                {(eruvim ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
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
          {purpose === 'eruv' && kind === 'page' && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5" checked={statusDated} onChange={(e) => setStatusDated(e.target.checked)} />
              <span>
                It dates each week’s post
                <span className="block text-xs text-muted">Then last week’s “up” shows as “Not posted yet this week”. Leave off for an eruv whose date is only when it last changed.</span>
              </span>
            </label>
          )}
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

export default function WatchesManager({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [data, setData] = useState<Loaded | null>(null)
  const [eruvData, setEruvData] = useState<Eruvim | null>(null)
  const [jobs, setJobs] = useState<Jobs>({ dishes: null, hospitals: null, hours: null })
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState<{ purpose: WatchPurpose; eruvId?: string } | 'open' | null>(null)
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
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [watches, eruvim, dishes, hospitals, hours] = await Promise.all([
        fetchJson<Loaded>(withCommunity('/api/admin/watches', community), { headers }, 'Failed to load the watches.'),
        // The eruvim and the jobs' counts are a part of the tab, not the
        // whole: without them, the rest still shows.
        fetchJson<Eruvim>(withCommunity('/api/admin/eruvim', community), { headers }, 'Failed to load the eruvim.').catch(() => null),
        fetchJson<{ places: DishPlace[] }>(withCommunity('/api/admin/main-dishes', community), { headers }, '').catch(() => null),
        fetchJson<{ hospitals: Hospital[] }>(withCommunity('/api/admin/watches/hospitals', community), { headers }, '').catch(() => null),
        fetchJson<{ name: string; places: HoursPlace[] }>(withCommunity('/api/admin/watches/hours?counts', community), { headers }, '').catch(() => null),
      ])
      setData(watches)
      setEruvData(eruvim)
      setJobs({ dishes: dishes?.places ?? null, hospitals: hospitals?.hospitals ?? null, hours: hours?.places ? { name: hours.name, places: hours.places } : null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

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

  /** An eruvim action; the eruv comes back as it now is. */
  async function eruvPost(id: string, body: Record<string, unknown>): Promise<boolean> {
    setSaveError(null)
    setBusy(`eruv:${id}`)
    try {
      const res = await post<{ eruv?: AdminEruv }>('/api/admin/eruvim', { id, ...body })
      if (res.eruv) setEruvData((d) => d && { ...d, eruvim: d.eruvim.map((e) => (e.id === id ? res.eruv! : e)) })
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function add(a: { purpose: WatchPurpose; source: string; listing: Listing | null; eruv: AdminEruv | null; statusDated: boolean }): Promise<boolean> {
    if (a.purpose === 'eruv' && a.eruv) {
      const email = sourceKind(a.source) === 'email'
      // One source for its status (eruvEdit.ts): the other is emptied.
      const edit = email ? { statusEmail: a.source.trim(), statusUrl: '' } : { statusUrl: a.source.trim(), statusEmail: '', statusDated: a.statusDated }
      if (!(await eruvPost(a.eruv.id, { action: 'save', edit }))) return false
      if (!email) await eruvPost(a.eruv.id, { action: 'check' })
      setAdding(null)
      return true
    }
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
      setAdding(null)
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

  // A hospital's Refuah page is on the Hospitals page, and a mikvah's hours
  // pages on the hours page.
  const hoursIds = new Set(jobs.hours?.places.map((p) => p.id))
  const listed = data.watches.filter((w) => !isHospitalWatch(w) && !isHoursOff(w) && !(w.resourceId && hoursIds.has(w.resourceId) && isListingPageWatch(w)))
  const groups = data.available ? groupWatches(listed, now, kept, readsOf) : []
  const eruvim = eruvData?.available ? eruvData.eruvim : []
  const eruvNeeds = eruvim.filter((e) => eruvPill(e).tone !== 'ok').length
  const counted = listed.filter((w) => !isIgnoredSender(w)).length + eruvim.length
  const base = adminBase(community)
  const menuWatches = data.watches.filter((w) => w.createdBy === MENU_WATCH_CREATOR)
  const hospitalsNothing = jobs.hospitals ? hospitalCounts(jobs.hospitals, now).nothing : 0
  const needs = groups.reduce((n, g) => n + g.counts.notWorking + g.counts.toLink, 0) + eruvNeeds

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

  function renderEruv(e: AdminEruv) {
    const view = eruvView(e, new Date(now), eruvData!.timezone, null)
    const source = e.statusUrl || (e.statusEmail ? `mailto:${e.statusEmail}` : null)
    const noSource = !source
    const failing = eruvPill(e).tone === 'bad'
    return (
      <Row
        key={e.id}
        testId="eruv-watch-row"
        name={e.name}
        source={<Source url={source} />}
        pill={eruvPill(e)}
        last={
          noSource ? (
            <p className="text-sm text-slate-500">Shows no status until it has a source.</p>
          ) : failing && e.statusError ? (
            <p className="text-sm font-medium text-red-700">Last read failed: {e.statusError}</p>
          ) : (
            <p className="text-sm text-slate-700">
              {view.label}
              {view.checked ? ` · ${view.checked}` : ''}
              {!e.active ? ' · hidden on the site' : ''}
            </p>
          )
        }
        alwaysShown={
          noSource ? (
            <button type="button" onClick={() => setAdding({ purpose: 'eruv', eruvId: e.id })} className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white">
              Add its source
            </button>
          ) : (
            <EruvKeptEmail eruv={e} timezone={eruvData!.timezone} busy={busy !== null} onSays={(says) => void eruvPost(e.id, { action: 'email-says', says })} />
          )
        }
      >
        {!noSource && (
          <>
            <p className="text-xs text-muted">
              {e.statusUrl
                ? 'Its status page, read every 15 minutes on Friday afternoon until candle lighting. What it says shows on the site at once.'
                : 'Its emails, read as each arrives. Up or down shows on the site at once, through that week’s Shabbos.'}
            </p>
            {e.statusWords && <p className="text-xs text-muted">Read from: “{e.statusWords}”</p>}
            {e.statusUrl && (
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5" checked={e.statusDated} disabled={busy !== null} onChange={(ev) => void eruvPost(e.id, { action: 'save', edit: { statusDated: ev.target.checked } })} />
                <span>
                  It dates each week’s post
                  <span className="block text-xs text-muted">Then last week’s “up” shows as “Not posted yet this week”.</span>
                </span>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              {e.statusUrl && (
                <button type="button" disabled={busy !== null} onClick={() => void eruvPost(e.id, { action: 'check' })} className={BUTTON}>
                  {busy === `eruv:${e.id}` ? 'Checking…' : 'Check now'}
                </button>
              )}
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm(`Stop reading ${e.name}’s status? It shows no status until it has a source again.`)) void eruvPost(e.id, { action: 'save', edit: { statusUrl: '', statusEmail: '' } })
                }}
                className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Stop reading
              </button>
            </div>
          </>
        )}
      </Row>
    )
  }

  const MENU_NOTE = 'Added on their own for each place whose menu is known: its menu link, or the page the reader found it on.'

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        What the guide reads on its own to stay current: pages every morning, emails as they arrive. <strong>What it finds goes to the moderation queue for you to approve</strong>, except an eruv&rsquo;s status, which shows at once. If a watch stops working, you&rsquo;re emailed once, and again when it works.
      </p>
      <section className="rounded-lg border border-slate-200 bg-white" aria-label="Jobs">
        <ul className="divide-y divide-slate-100">
          <JobRow
            href={`${base}/watches/dishes`}
            name="Dishes"
            about={jobs.dishes ? `${jobs.dishes.length} food places, from their menus` : 'Food places, from their menus'}
            counts={jobs.dishes && dishCounts(jobs.dishes, menuWatches, now)}
          />
          <JobRow
            href={`${base}/watches/hospitals`}
            name="Hospitals"
            about={
              jobs.hospitals
                ? `${jobs.hospitals.length} hospital${jobs.hospitals.length === 1 ? '' : 's'}, from Refuah${hospitalsNothing ? ` · ${hospitalsNothing} with nothing there yet` : ''}`
                : 'Hospitals, from Refuah'
            }
            counts={jobs.hospitals && hospitalCounts(jobs.hospitals, now)}
          />
          {jobs.hours && jobs.hours.places.length > 0 && (
            <JobRow
              href={`${base}/watches/hours`}
              name={jobs.hours.name}
              about={`${jobs.hours.places.length} place${jobs.hours.places.length === 1 ? '' : 's'}, from their websites`}
              counts={hoursCounts(jobs.hours.places.map((p) => ({ pages: p.pages.map((x) => x.watch), off: p.off })), now)}
            />
          )}
        </ul>
      </section>
      {!data.available && (
        <p className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
          Keeping a list here needs database migration 070. Until it&rsquo;s run, Keystone-K&rsquo;s list is still read every morning.
        </p>
      )}

      {data.available && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-800" data-testid="watch-summary">
            <strong>{counted} watches</strong> · {needs === 0 ? 'all working' : <span className="font-semibold text-amber-800">{needs} need{needs === 1 ? 's' : ''} you</span>}
          </p>
          {!adding && (
            <button type="button" onClick={() => setAdding('open')} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
              Add a watch
            </button>
          )}
        </div>
      )}
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}

      {data.available && adding && (
        <AddWatch
          key={adding === 'open' ? 'open' : `${adding.purpose}:${adding.eruvId ?? ''}`}
          listings={listings}
          eruvim={eruvim}
          start={adding === 'open' ? null : adding}
          busy={busy !== null}
          onAdd={add}
          onCancel={() => setAdding(null)}
        />
      )}

      {eruvim.length > 0 && (
        <GroupSection label="Eruv status" total={eruvim.length} needs={eruvNeeds ? `${eruvNeeds} need${eruvNeeds === 1 ? 's' : ''} you` : null} collapsibleGroup={false} open onToggle={() => {}}>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {[...eruvim].sort((a, b) => Number(eruvPill(a).tone === 'ok') - Number(eruvPill(b).tone === 'ok') || a.sortOrder - b.sortOrder).map(renderEruv)}
          </ul>
        </GroupSection>
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
            note={g.key === 'menu' ? MENU_NOTE : undefined}
            collapsibleGroup={collapsible(g)}
            open={open}
            onToggle={() => toggle(g.key)}
          >
            {shown.length > 0 && <ul className="divide-y divide-slate-100 border-t border-slate-100">{shown.map(renderRow)}</ul>}
          </GroupSection>
        )
      })}
      {data.available && data.watches.length === 0 && eruvim.length === 0 && (
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
