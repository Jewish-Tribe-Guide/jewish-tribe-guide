'use client'

import { BUILT_IN_BLOCKS, canShareRow, cardRows, fromCardRows, MAX_CARDS_IN_ROW, type DraftHomeSection, type HomeBlockKind } from '@/lib/homeSections'
import type { SiteSettings } from '@/lib/siteSettings'
import DragList, { addButton, InnerRow } from './DragList'

// ── The computer home's cards under the search, in rows (the user, Nov 4;
// drawn as artifact 8HpeQANzsQyGbyHVPsXrc5). A card on its own fills its
// row; cards in one box share a row, up to three, and Categories is always
// alone (cardRows in homeSections.ts). Each card is a handle, its name and
// an ×: nothing opens, and there is no width. A card taken off comes back
// from "+ Add". Same shared draft/Save pipeline as the category sections
// (see homeSectionsDraft.ts).
//
// Dragged up and down only, as every other list: between two rows sit two
// gaps, so a card dropped just under a row joins it, one dropped between
// the boxes has a row of its own, and one just over the next row joins
// that. A gap is passed at its outer edge, not its middle, so the whole
// space between two boxes is the own-row spot (the user, Nov 4: moving a
// card out of a box into a row between was "not so easy"). The keyboard
// steps through the same places.
//
// What a card says is fixed here: nobody had changed any of it (checked on
// live, Nov 4), so the fields went. The site still reads the saved words.
//
// `sections` (the draft prop) holds every home_section row — this only ever
// reads/reorders the cards, leaving plain category sections and retired
// kinds in the draft untouched.

type CardKind = Exclude<HomeBlockKind, 'section' | 'map'>

/** The cards offered, in the order "+ Add" lists them. 'map' (the map on the
 *  home screen) is retired: Landing.tsx renders nothing for a leftover row. */
const CARD_KINDS: CardKind[] = ['browse', 'davening', 'listings', 'suggest', 'subscribe', 'jewishTimes']
const CARD_KIND_SET = new Set<string>(CARD_KINDS)

/** The setting that names a card on the site, where it has one. */
const HEADING_KEY: Partial<Record<CardKind, keyof SiteSettings>> = {
  listings: 'desktopListingsHeading',
  subscribe: 'desktopSubscribeHeading',
  jewishTimes: 'desktopJewishTimesHeading',
}

type Card = DraftHomeSection & { kind: CardKind }
type Item = { card: Card } | { gap: string }
const isCard = (i: Item): i is { card: Card } => 'card' in i

/** The cards as the list shows them: a gap above, two between rows, one
 *  below. */
function toItems(cards: Card[]): Item[] {
  const items: Item[] = [{ gap: 'top' }]
  cardRows(cards).forEach((row, r) => {
    if (r > 0) items.push({ gap: `${r}a` }, { gap: `${r}b` })
    items.push(...row.map((card) => ({ card })))
  })
  items.push({ gap: 'end' })
  return items
}

/** The rows the list now holds: the cards between gaps. */
function itemRows(items: readonly Item[]): Card[][] {
  const rows: Card[][] = [[]]
  for (const item of items) {
    if (isCard(item)) rows.at(-1)!.push(item.card)
    else if (rows.at(-1)!.length) rows.push([])
  }
  return rows.filter((row) => row.length)
}

/** Every row one the home page can draw. */
function rowsFit(rows: Card[][]): boolean {
  return rows.every((row) => row.every((card, i) => i === 0 || canShareRow(row.slice(0, i), card)))
}

function sameRows(a: Card[][], b: Card[][]): boolean {
  const key = (rows: Card[][]) => rows.map((row) => row.map((c) => c.id).join(',')).join('|')
  return key(a) === key(b)
}

/** The run of cards item `i` is in, or null for a gap. */
function runAt(items: readonly Item[], i: number): Card[] | null {
  if (!isCard(items[i]!)) return null
  let start = i
  while (start > 0 && isCard(items[start - 1]!)) start--
  let end = i
  while (end < items.length - 1 && isCard(items[end + 1]!)) end++
  return items.slice(start, end + 1).map((it) => (it as { card: Card }).card)
}

export default function DesktopTopicsManager({
  sections,
  onChange,
  settings,
  onPointCard,
}: {
  sections: DraftHomeSection[]
  onChange: (sections: DraftHomeSection[]) => void
  /** The draft SiteSettings, read-only here: a card's name on the site. */
  settings: SiteSettings
  /** The mouse on a card, or null off it: the preview lights that card. */
  onPointCard?: (kind: string | null) => void
}) {
  const cards = sections.filter((s): s is Card => s.kind !== 'section' && CARD_KIND_SET.has(s.kind))
  const others = sections.filter((s) => s.kind === 'section' || !CARD_KIND_SET.has(s.kind))
  const missing = CARD_KINDS.filter((k) => !cards.some((c) => c.kind === k))
  const items = toItems(cards)

  // What a visitor sees it called: its heading, or the card's name.
  function nameOf(kind: CardKind) {
    const key = HEADING_KEY[kind]
    return (key && (settings[key] as string)) || BUILT_IN_BLOCKS[kind].title.replace(/ Card$/, '')
  }

  const save = (rows: Card[][]) => onChange([...others, ...fromCardRows(rows)])

  function addCard(kind: CardKind) {
    const b = BUILT_IN_BLOCKS[kind]
    save([...cardRows(cards), [{ id: b.id, kind, title: b.title, cardIds: [], sharesRow: false }]])
  }

  function removeCard(id: string) {
    save(cardRows(cards).map((row) => row.filter((c) => c.id !== id)).filter((row) => row.length))
  }

  // A row's box, drawn on the spots its cards sit in, so it stays put while
  // one of them is lifted.
  function slotClass(item: Item, i: number, shown: readonly Item[], dragKey: string | null) {
    if (!isCard(item)) return ''
    const run = runAt(shown, i)!
    if (run.length < 2) return ''
    const first = run[0] === item.card
    const last = run.at(-1) === item.card
    const holdsLifted = dragKey !== null && run.some((c) => c.id === dragKey)
    const full = dragKey !== null && !holdsLifted && run.length >= MAX_CARDS_IN_ROW
    return [
      'border-x px-1.5',
      holdsLifted ? 'border-primary bg-blue-50' : 'border-slate-200 bg-slate-50',
      first ? 'rounded-t-[10px] border-t pt-1.5' : '',
      last ? 'rounded-b-[10px] border-b pb-1.5' : 'pb-1.5',
      full ? 'opacity-50' : '',
    ].join(' ')
  }

  return (
    <div>
      <DragList
        items={items}
        keyOf={(i) => (isCard(i) ? i.card.id : `gap:${i.gap}`)}
        nameOf={(i) => (isCard(i) ? nameOf(i.card.kind) : '')}
        onReorder={(next) => save(itemRows(next))}
        canMove={(next, via) => {
          const rows = itemRows(next)
          // An arrow press always changes the rows: the step between the
          // two gaps under a row changes nothing on the page.
          return rowsFit(rows) && (via === 'pointer' || !sameRows(rows, cardRows(cards)))
        }}
        slotClass={slotClass}
        dropEdge={(i) => (isCard(i) ? undefined : i.gap === 'top' || i.gap.endsWith('b') ? 'bottom' : 'top')}
        className="px-3"
      >
        {(item, row) => {
          if (!isCard(item)) return <div className="h-3" aria-hidden="true" />
          const { card } = item
          return (
            <div onMouseEnter={() => onPointCard?.(card.kind)} onMouseLeave={() => onPointCard?.(null)}>
              <InnerRow row={row} name={nameOf(card.kind)} onRemove={() => removeCard(card.id)} className="rounded-[10px] border border-slate-200 bg-white" />
            </div>
          )
        }}
      </DragList>

      {missing.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-1.5 pb-3">
          {missing.map((k) => (
            <button key={k} type="button" onClick={() => addCard(k)} className={addButton}>
              + Add {nameOf(k)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
