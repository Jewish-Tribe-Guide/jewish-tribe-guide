'use client'

import { useEffect, useRef, useState } from 'react'
import type { CategoryField } from '@/lib/categories'
import { boxOf, boxRenames, fieldItems, fieldLine, itemKey, orderProblem, readOrder, rowsOfBox, type FieldBox, type FieldItem, type FieldPage } from '@/lib/fieldBoxes'
import type { ListingParts } from '@/lib/listingParts'
import { Chevron } from './AdminUI'
import DragList, { addListButton, PLUS, RowName, X, type DragRow } from './DragList'

// Site → Category pages → a page → Fields, as board E1b draws it (the user,
// Nov 10: "I like the creativity. I just want you to implement it"): every
// box is open, a card of its own with its name on a grey head, its fields
// as rows under it (each with its Filter and Under the name tags, opening
// its own screen), and "+ Add a field" across its foot. A box's handle
// carries the box with its fields; a field's moves it, into another box
// too, which turns blue while it's over it, or red with why when it can't
// take it. The admin's boxes, and the listing's own from a field made here,
// are renamed by tapping the name; a ready-made field's keeps its name.
//
// Every box starts open, as E1b draws it. A box with something in it folds
// and opens by the chevron at the end of its name bar; an empty one has its
// X there instead (the user, Nov 10: "once we add a field then a box turns
// into an accordion and we remove the x"). A field dragged onto a folded
// box goes in at its end.

/** Where the handle would be: rows that don't move keep their names lined
 *  up with the ones that do. */
const NO_HANDLE = <span aria-hidden="true" className="h-11 w-8 shrink-0" />
const still = (row: DragRow): DragRow => ({ ...row, handle: NO_HANDLE, rowProps: { onPointerDown: () => {}, onContextMenu: () => {} } })


/** E1b's "+ Add a box": a dashed button as wide as the list. */
export { addListButton as addBoxButton, PLUS as PlusIcon }

export default function FieldBoxes({
  page,
  boxes,
  parts,
  freshId,
  landed,
  onChange,
  onRename,
  onOwnBox,
  onRemoveBox,
  onAddField,
  onShowField,
  onShowBasic,
}: {
  page: FieldPage
  boxes: FieldBox[]
  parts: ListingParts
  /** A box just added: its name starts selected (board 19). */
  freshId: string | null
  /** The row just added (`field:…`, `basic:…`): scrolled to and lit. */
  landed?: string | null
  /** A drop: the admin's boxes, and the page's fields' new order when a box
   *  of the listing's own was reordered. */
  onChange: (parts: ListingParts, order: string[] | null) => void
  onRename: (id: string, title: string) => void
  /** A box of the listing's own, tapped to rename: it becomes the admin's. */
  onOwnBox?: (id: string) => void
  onRemoveBox: (id: string) => void
  onAddField: (boxId: string) => void
  onShowField: (key: string) => void
  onShowBasic: (basic: 'address' | 'phone') => void
}) {
  // Folded boxes, by id: just their name bar in the list.
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set())
  const items = boxes.flatMap((box) => (folded.has(box.id) ? [{ box }] : fieldItems([box])))
  const all = fieldItems(boxes)
  const fold = (id: string, on: boolean) =>
    setFolded((f) => {
      const next = new Set(f)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const byKey = new Map<string, CategoryField>([...page.fields, ...(page.hiddenFields ?? [])].map((f) => [f.key, f]))
  const hidden = new Set((page.hiddenFields ?? []).map((f) => f.key))
  const list = useRef<HTMLDivElement>(null)
  // A field landing in a folded box opens it, so it can be seen landing
  // (set while rendering, as React's "adjusting state on a prop change").
  const [seenLanded, setSeenLanded] = useState(landed)
  if (landed !== seenLanded) {
    setSeenLanded(landed)
    const landedIn = landed ? boxOf(all, landed) : null
    if (landedIn && folded.has(landedIn)) fold(landedIn, false)
  }
  useEffect(() => {
    if (landed) list.current?.querySelector(`[data-drag-row="${CSS.escape(landed)}"]`)?.scrollIntoView?.({ block: 'center' })
  }, [landed])

  function slot(item: FieldItem, i: number, shown: readonly FieldItem[], dragKey: string | null, refused: readonly FieldItem[] | null) {
    const key = itemKey(item)
    const owner = 'box' in item ? item.box.id : boxOf(shown, key)
    // The box a lifted field is over, when it isn't the one it came from.
    const no = refused && orderProblem(items, refused, page)
    const turnedDown = no?.at === owner
    const over = !turnedDown && dragKey?.startsWith('field:') && boxOf(shown, dragKey) === owner && boxOf(items, dragKey) !== owner
    const edge = turnedDown ? 'border-red-400 bg-red-50' : over ? 'border-primary bg-blue-50' : 'border-slate-200'
    if ('box' in item)
      return {
        className: `${i === 0 ? '' : 'mt-3'} overflow-hidden border ${folded.has(item.box.id) ? 'rounded-xl' : 'rounded-t-xl border-b-slate-100'} ${turnedDown || over ? edge : 'border-slate-200 bg-slate-50'}`,
        note: turnedDown ? <p className="m-0 px-4 pb-2.5 text-[13px] font-semibold text-red-700">{no!.why}</p> : undefined,
      }
    const afterHead = i > 0 && 'box' in shown[i - 1]
    if ('end' in item) return { className: `rounded-b-xl border-x border-b ${edge} ${afterHead ? '' : 'border-t border-t-slate-100'} ${turnedDown || over ? '' : 'bg-white'}` }
    const lit = landed === key ? 'bg-blue-50' : turnedDown || over ? '' : 'bg-white'
    return { className: `border-x ${edge} ${afterHead ? '' : 'border-t border-t-slate-100'} ${lit}` }
  }

  return (
    <div ref={list} className="px-4 pb-1 pt-4">
      <DragList
        items={items}
        keyOf={itemKey}
        nameOf={(i) => ('box' in i ? i.box.title || 'New box' : 'field' in i ? byKey.get(i.field)?.label || 'New field' : 'basic' in i ? (i.basic === 'address' ? 'Address' : 'Phone') : '')}
        // From the keyboard, a step that changes nothing (the phone above
        // the address, which always come first) is passed over.
        canMove={(next, via) => orderProblem(items, next, page) === null && (via === 'pointer' || changes(readOrder(items, next, parts, page), parts))}
        carries={(i, all) => ('box' in i ? rowsOfBox(all, i.box.id) : [])}
        onReorder={(next) => {
          const read = readOrder(items, next, parts, page)
          onChange(read.parts, read.order)
        }}
        slot={slot}
      >
        {(item, row) => {
          if ('box' in item) {
            const box = item.box
            const name = box.title || 'New box'
            const renames = boxRenames(box, page)
            return (
              <div className="flex min-h-[52px] items-center gap-1 py-1.5 pl-1 pr-3">
                {box.moves ? row.handle : NO_HANDLE}
                {renames ? (
                  <span className="flex min-w-0 flex-1">
                    <RowName
                      name={name}
                      rename={{
                        value: box.title,
                        placeholder: 'New box',
                        onChange: (t) => onRename(box.id, t),
                        fresh: box.id === freshId,
                        ...(box.kind === 'listing' && onOwnBox && { onStart: () => onOwnBox(box.id) }),
                      }}
                    />
                  </span>
                ) : (
                  <h3 {...(box.moves ? row.rowProps : {})} className="m-0 min-w-0 flex-1 select-none text-base font-semibold text-slate-900">
                    {name}
                  </h3>
                )}
                {/* An empty box comes off by its X; one with fields in it
                    has none, and folds by its chevron instead. Its X is
                    back once its last field is taken off or dragged out
                    (the user, Nov 10: "once we add a field ... we remove
                    the x"). Not "Not on the listing". */}
                {(box.fields.length > 0 || (box.basics?.length ?? 0) > 0) && (
                  <button
                    type="button"
                    onClick={() => fold(box.id, !folded.has(box.id))}
                    aria-expanded={!folded.has(box.id)}
                    aria-label={name}
                    className="grid h-11 w-10 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-slate-100"
                  >
                    <span className={`transition-transform ${folded.has(box.id) ? '' : 'rotate-90'}`}>
                      <Chevron />
                    </span>
                  </button>
                )}
                {box.moves && !box.fields.length && !box.basics?.length && (
                  <button
                    type="button"
                    onClick={() => onRemoveBox(box.id)}
                    aria-label={`Take ${name} off`}
                    className="grid h-11 w-10 shrink-0 cursor-pointer place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    {X}
                  </button>
                )}
              </div>
            )
          }
          if ('end' in item) {
            const box = boxes.find((b) => b.id === item.end)!
            const name = box.title || 'New box'
            const add = (
              <button type="button" onClick={() => onAddField(box.id)} aria-label={`Add a field to ${name}`} className="flex min-h-[46px] flex-1 cursor-pointer items-center gap-2 pl-10 pr-4 text-left text-[15px] font-semibold text-primary hover:bg-blue-50/60">
                {PLUS}
                Add a field
              </button>
            )
            if (!box.moves) return <div className="h-1" />
            return <div className="flex items-center">{add}</div>
          }
          if ('basic' in item) {
            const name = item.basic === 'address' ? 'Address' : 'Phone'
            return <Inner row={row} name={name} onOpen={() => onShowBasic(item.basic)} />
          }
          const f = byKey.get(item.field)
          return <Inner row={hidden.has(item.field) ? still(row) : row} name={f?.label || 'New field'} tags={f ? tagsOf(f) : []} onOpen={() => onShowField(item.field)} />
        }}
      </DragList>
    </div>
  )
}

/** A field's tags on its row (E1b): Filter, Under the name. Nothing else
 *  under a field's name (the user, Nov 10: "I don't think we need those
 *  descriptions underneath the fields"). */
function tagsOf(f: CategoryField): string[] {
  return (fieldLine(f) ?? '').split(' · ').filter((t) => t === 'Filter' || t === 'Under the name')
}

/** A field in its box: its handle, name and tags, and a chevron to its own
 *  screen. */
function Inner({ row, name, tags = [], onOpen }: { row: DragRow; name: string; tags?: string[]; onOpen: () => void }) {
  return (
    <div className="flex min-h-[46px] items-center gap-1 pl-1 pr-3">
      {row.handle}
      <button type="button" onClick={onOpen} {...row.rowProps} className="flex min-h-11 min-w-0 flex-1 cursor-pointer select-none items-center gap-2 py-1.5 text-left">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-[15px] text-slate-900">{name}</span>
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
              {t}
            </span>
          ))}
        </span>
        <Chevron />
      </button>
    </div>
  )
}

/** Whether a reorder changes what's saved. */
function changes(read: { parts: ListingParts; order: string[] | null }, parts: ListingParts): boolean {
  return read.order !== null || JSON.stringify(read.parts) !== JSON.stringify(parts)
}
