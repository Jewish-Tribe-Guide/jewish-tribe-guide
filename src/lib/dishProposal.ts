// ── What a menu reading would make a place's list of dishes (Oct 21) ────────
// Drawn on artifact 7EYjgU1WcHrXG2W6Qpigb7. The Main dishes box on the
// Dishes page is the listing's own list, marked by what its menu said:
//   new        on the menu, not on the listing: highlighted
//   gone       a dish a reader found on its menu before, and the menu
//              doesn't name now: crossed out, "Not on the menu"
//   not_found  on the listing with no menu date (added by hand, or by a
//              visitor), and the menu doesn't name it either: the reader
//              missed it once already, so missing it again says nothing.
//              Kept, and looked for again on the next read (the user, Oct 21)
//   same       on both
//   unchecked  on the listing, and the reading didn't look for it (read
//              before it looked, or from photos that may be part of a menu)
// "Use this" makes the listing's list `always` + `sometimes`: the gone
// ones off, the new ones on, everything else where it was.
//
// Pure: the listing's marks and the stored reading in, the proposal out.

export type DishStatus = 'same' | 'new' | 'gone' | 'not_found' | 'unchecked'

export type ReadDish = { name: string; quote: string; checked: boolean; named?: boolean; picture?: true }

export type DishRow = {
  name: string
  status: DishStatus
  /** The menu's own words it was read from, for one the menu names. */
  quote?: string
  /** Its words were found on the page (not so for a PDF or a picture). */
  checked?: boolean
  /** Its words name it, not only a line near it. */
  named?: boolean
  picture?: true
}

/** The listing's side: its dishes, which of them are "not always", and
 *  which carry a menu date (a reader found them on its menu before). */
export type ListedDishes = { dishes: readonly string[]; sometimes?: readonly string[]; menuDated?: readonly string[] }

export type DishProposal = {
  rows: DishRow[]
  /** The listing's list once used: always, then not always. */
  always: string[]
  sometimes: string[]
  /** New and gone, the rows Use this changes. */
  updates: number
  /** The box's pill: one kind named ("3 not on the menu", "1 new"),
   *  "N updates" for both, null for none. */
  pill: string | null
}

const lower = (s: string) => s.trim().toLowerCase()

export function dishProposal(listed: ListedDishes, reading: { dishes: readonly ReadDish[]; missing?: readonly string[] }): DishProposal {
  const sometimes = new Set((listed.sometimes ?? []).map(lower))
  const dated = new Set((listed.menuDated ?? []).map(lower))
  const missing = new Set((reading.missing ?? []).map(lower))
  const read = new Map(reading.dishes.map((d) => [lower(d.name), d]))
  const onListing = new Set(listed.dishes.map(lower))

  const gone: DishRow[] = []
  const notFound: DishRow[] = []
  const unchecked: DishRow[] = []
  for (const name of listed.dishes) {
    const k = lower(name)
    if (read.has(k)) continue
    if (missing.has(k)) (dated.has(k) ? gone : notFound).push({ name, status: dated.has(k) ? 'gone' : 'not_found' })
    else unchecked.push({ name, status: 'unchecked' })
  }
  const found: DishRow[] = reading.dishes.map((d) => {
    const listedName = listed.dishes.find((n) => lower(n) === lower(d.name))
    return {
      name: listedName ?? d.name,
      status: listedName ? 'same' : 'new',
      quote: d.quote,
      checked: d.checked,
      ...(d.named !== undefined ? { named: d.named } : {}),
      ...(d.picture ? { picture: true as const } : {}),
    }
  })
  const fresh = found.filter((r) => r.status === 'new')

  const goneKeys = new Set(gone.map((r) => lower(r.name)))
  const kept = listed.dishes.filter((n) => !goneKeys.has(lower(n)))
  const always = [...kept.filter((n) => !sometimes.has(lower(n))), ...fresh.map((r) => r.name).filter((n) => !onListing.has(lower(n)))]
  const notAlways = kept.filter((n) => sometimes.has(lower(n)))

  const updates = gone.length + fresh.length
  const pill = gone.length && fresh.length ? `${updates} updates` : gone.length ? `${gone.length} not on the menu` : fresh.length ? `${fresh.length} new` : null
  return { rows: [...gone, ...found, ...notFound, ...unchecked], always, sometimes: notAlways, updates, pill }
}

// ── What its last read made of each dish (the user, Oct 26) ─────────────────
// "What I really want is to see or know if the AI reader is picking things
// up that was added." A dish with no menu date is one no read has found on
// its menu yet: added by hand, or by a visitor. Its row on the place's
// Dishes box says what the last read made of it:
//   on_menu     the reading names it
//   not_found   the reading looked for it, and its menu doesn't name it
//   not_looked  the reading didn't look for it: read before it was added,
//               or from pictures, which may be only part of a menu
// A dish with a menu date was found by a read already, and is marked only
// when the last read looked and didn't find it.

export type ReaderMark = 'on_menu' | 'not_found' | 'not_looked'

export const READER_MARK_TEXT: Record<ReaderMark, string> = {
  on_menu: 'On its menu',
  not_found: 'Not found on its menu',
  not_looked: 'Not looked for yet',
}

/** The marked dishes, by the listing's name for each; one not in it has none. */
export function readerMarks(listed: ListedDishes, reading: { dishes: readonly Pick<ReadDish, 'name'>[]; missing?: readonly string[] } | null): Map<string, ReaderMark> {
  const dated = new Set((listed.menuDated ?? []).map(lower))
  const named = new Set((reading?.dishes ?? []).map((d) => lower(d.name)))
  const missing = new Set((reading?.missing ?? []).map(lower))
  const out = new Map<string, ReaderMark>()
  for (const name of listed.dishes) {
    const k = lower(name)
    if (missing.has(k)) out.set(name, 'not_found')
    else if (dated.has(k)) continue
    else out.set(name, named.has(k) ? 'on_menu' : 'not_looked')
  }
  return out
}
