import type { CategoryConfig } from '@/lib/categories'
import type { AdminEruv } from '@/lib/eruvStore'
import { websiteWatchOf } from '@/lib/eruvJob'
import { websiteKeyOf } from '@/lib/googleJob'
import { KOSHER_LIST_NAMES } from '@/lib/kosherJob'
import { keepsMenuLink, MENU_LINK_KEY } from '@/lib/menuLink'
import { kindOf } from '@/lib/placeKinds'
import type { Watch } from '@/lib/watches'
import type { ReadFromProps } from './ReadFrom'
import type { ReadStep } from './openedPlaceBoxes'
import type { Jobs } from './useWatchJobs'

// What a place's Read from box says (ReadFrom.tsx), from the jobs the
// Places listing already has: a listing's, and an eruv's.

type Facts = Pick<ReadFromProps, 'facts' | 'read' | 'google'>

const sender = (w: Pick<Watch, 'url'>) => w.url.replace(/^mailto:/, '')
const newestFirst = (a: { at: string | null }, b: { at: string | null }) => (b.at ?? '').localeCompare(a.at ?? '')

export function listingReadFrom(id: string, jobs: Jobs, category: CategoryConfig, listing: Record<string, unknown>): Facts {
  const kind = kindOf(category)
  const off = (k: string) => !!jobs.runs?.off?.includes(k as never)
  const times = off('times') ? undefined : jobs.times?.places.find((p) => p.id === id)
  const hours = off('hours') ? undefined : jobs.hours?.places.find((p) => p.id === id)
  // Its own website's first page a job reads, as listingSources has it.
  const own = [...(times?.pages ?? []), ...(hours?.pages ?? []), ...(off('sites') ? [] : (jobs.sites?.find((p) => p.id === id)?.pages ?? []))].map((p) => p.watch).find((w) => w.active)
  const key = websiteKeyOf(category)
  const read: ReadStep | null = times ? { job: 'times', resourceId: id } : hours ? { job: 'hours', resourceId: id } : own ? { job: 'watch', watchId: own.id } : null
  const google = jobs.google?.places.find((p) => p.id === id) ?? null
  const kosher = jobs.kosher?.places.find((p) => p.id === id)
  return {
    facts: {
      kind,
      website: key ? ((listing[key] as string | null | undefined) || null) : undefined,
      site: own ? { ok: !own.lastError } : null,
      emails: (times?.newsletters ?? []).filter((w) => w.active).map((w) => ({ sender: sender(w), at: w.pageChangedAt ?? null })).sort(newestFirst),
      ...(google ? { google: { matched: google.matched } } : {}),
      ...(keepsMenuLink(category) ? { menu: (listing[MENU_LINK_KEY] as string | null | undefined) || null } : {}),
      lists: [...new Set((kosher?.on ?? []).map((o) => KOSHER_LIST_NAMES[o.list]))],
      refuah: kind === 'hospitals' && !!jobs.hospitals?.find((h) => h.id === id)?.watch,
    },
    read,
    google,
  }
}

export function eruvReadFrom(eruv: AdminEruv, jobs: Jobs): Facts {
  const watch = websiteWatchOf(eruv, jobs.eruvim?.watches ?? [])
  return {
    facts: {
      kind: 'eruv',
      website: eruv.website,
      site: watch ? { ok: !watch.lastError } : null,
      emails: eruv.statusEmail ? [{ sender: eruv.statusEmail, at: eruv.statusEmailKept?.sentAt ?? null }] : [],
      statusPage: eruv.statusUrl,
      lists: [],
      refuah: false,
    },
    read: eruv.website ? { job: 'eruv-site', id: eruv.id } : null,
    google: null,
  }
}
