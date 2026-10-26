import type { CategoryConfig } from '@/lib/categories'
import type { KosherList, KosherPlace, NewOnList } from '@/lib/kosherJob'
import type { JobCounts } from '@/lib/watchJobs'
import type { Watch } from '@/lib/watches'
import type { Finding } from '@/lib/watchFindings'
import type { Decided } from '@/lib/watchFindingStore'
import type { ContactField } from '@/lib/contactRead'

// What each job's GET hands the Watches tab's kind pages (useWatchJobs.ts),
// once the job pages that drew them were gone (Oct 26).

/** A place's phone and email as its listing has them (contactRead.ts's
 *  listedContact). */
export type ListedContact = { name: string; fields: (ContactField & { value: string | null })[] }

// ── Mikvah hours and Shul times (/api/admin/watches/hours) ──────────────────
type Page = { watch: Watch; source: string }
export type HoursPlace = {
  id: string
  name: string
  href: string
  website: string | null
  pages: Page[]
  /** Pages an admin stopped: never read, and never found again. */
  stopped?: Page[]
  off: boolean
  offSince: string | null
  /** Why a place with no page has nothing to read. */
  reason: string | null
  /** What its pages (or a shul's newsletter) found, waiting to compare. */
  findings?: Finding[]
  /** When its last finding was decided, and how. */
  decided?: Decided | null
  /** A shul's newsletters, read as part of it (Shul times only). */
  newsletters?: Watch[]
  fields: string[]
  /** Its phone and email as listed, less what Google keeps, for its
   *  Phone or Contact box. */
  contact?: ListedContact | null
}

// ── Hospitals (/api/admin/watches/hospitals) ───────────────────────────────
type Refuah = { id: string; name: string; street: string | null; url: string }
/** One of its listing's boxes of contacts, as the listing has it now. */
export type ListedBox = { title: string; keys: string[]; labels: string[]; now: Record<string, unknown> }
export type Hospital = {
  id: string
  name: string
  href: string
  watch: Watch | null
  notOnRefuah: boolean
  source: 'match' | 'hand' | null
  line: string
  refuah: Refuah | null
  nearby: (Refuah & { miles: number })[]
  /** What Refuah has that the listing doesn't, waiting to compare. */
  findings?: Finding[]
  /** When its last finding was decided, and how. */
  decided?: Decided | null
  boxes?: ListedBox[]
}

// ── Kosher certification (/api/admin/watches/kosher) ───────────────────────
export type KosherListState = { list: KosherList; url: string; watch: Watch | null; error: string | null; entries: number | null; updated: string | null }
/** A finding with what it would make the listing (`values`), and a new
 *  place's address and category. */
type KosherFinding = Finding & { address?: string; category?: string }
type Place = KosherPlace & { href: string; box?: Record<string, unknown>; findings?: KosherFinding[]; decided?: Decided | null }
type NewPlace = NewOnList & { findings?: KosherFinding[] }
export type KosherLoaded = {
  available: boolean
  categories?: CategoryConfig[]
  lists: KosherListState[]
  counts: JobCounts & { notListed: number }
  places: Place[]
  newPlaces: NewPlace[]
  /** What a list filed that matches no place now (the list changed since). */
  others?: KosherFinding[]
}
