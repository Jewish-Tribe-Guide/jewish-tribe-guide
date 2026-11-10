'use client'

import type { CategoryField } from '@/lib/categories'
import { boxLine, boxName, boxOf, boxRenames, fieldItems, fieldLine, itemKey, orderProblem, readOrder, type FieldBox, type FieldItem, type FieldPage } from '@/lib/fieldBoxes'
import type { ListingParts } from '@/lib/listingParts'
import { Chevron } from './AdminUI'
import DragList, { addButton, OrderRow, RowActions, type DragRow } from './DragList'

// Site → Category pages → a page → Fields (boards 17-19): the boxes of one
// of its opened listings, in the order a visitor sees them (fieldBoxes.ts).
// A box opens in place to its fields, each opening that field's screen; the
// admin's own, and the listing's own from a field made here, are renamed in
// place (a ready-made field's keeps its name). Every box but Top and "Not
// on the listing" is dragged anywhere and has a trash can. A field moves by
// dragging it onto another box's row, which is drawn dashed while it's
// over it, or red with why when that box can't take it.

/** Where the handle would be: rows that don't move keep their names lined
 *  up with the ones that do. */
const NO_HANDLE = <span aria-hidden="true" className="h-11 w-8 shrink-0" />
const still = (row: DragRow): DragRow => ({ ...row, handle: NO_HANDLE, rowProps: { onPointerDown: () => {}, onContextMenu: () => {} } })

export default function FieldBoxes({
  page,
  boxes,
  parts,
  openId,
  freshId,
  onOpen,
  onChange,
  onRename,
  onRemoveBox,
  onAddField,
  onShowField,
  onShowBasic,
  topLine = 'Just the name',
}: {
  page: FieldPage
  boxes: FieldBox[]
  parts: ListingParts
  openId: string | null
  /** A box just added: its name starts selected (board 19). */
  freshId: string | null
  onOpen: (id: string | null) => void
  /** A drop: the admin's boxes, and the page's fields' new order when a box
   *  of the listing's own was reordered. */
  onChange: (parts: ListingParts, order: string[] | null) => void
  onRename: (id: string, title: string) => void
  onRemoveBox: (id: string) => void
  onAddField: (boxId: string) => void
  onShowField: (key: string) => void
  onShowBasic: (basic: 'address' | 'phone') => void
  /** What Top says with no fields in it: an eruv's has its status too. */
  topLine?: string
}) {
  const items = fieldItems(boxes, openId)
  const byKey = new Map<string, CategoryField>([...page.fields, ...(page.hiddenFields ?? [])].map((f) => [f.key, f]))
  const hidden = new Set((page.hiddenFields ?? []).map((f) => f.key))
  const lastBox = boxes.at(-1)?.id

  function slot(item: FieldItem, _i: number, shown: readonly FieldItem[], dragKey: string | null, refused: readonly FieldItem[] | null) {
    const key = itemKey(item)
    if ('box' in item) {
      const no = refused && orderProblem(items, refused, page)
      if (no?.at === item.box.id)
        return {
          className: 'rounded-[10px] bg-red-50 outline-2 outline-dashed outline-red-400 -outline-offset-4',
          note: <p className="m-0 px-4 pb-2.5 text-[13px] font-semibold text-red-700">{no.why}</p>,
        }
      // The box a lifted field is over, when it isn't the one it came from.
      const over = dragKey?.startsWith('field:') && boxOf(shown, dragKey) === item.box.id && boxOf(items, dragKey) !== item.box.id && item.box.id !== openId
      if (over) return { className: 'rounded-[10px] bg-blue-50 outline-2 outline-dashed outline-primary -outline-offset-4' }
      return { className: item.box.id === openId || item.box.id === lastBox ? '' : 'border-b border-slate-100' }
    }
    if ('end' in item) return { className: `px-4 pb-4 pt-2.5 sm:pl-12 ${item.end === lastBox ? '' : 'border-b border-slate-100'}` }
    // A field or the address and phone: in a box of their own, under its row.
    const inside = shown.filter((i) => !('box' in i) && !('end' in i) && boxOf(shown, itemKey(i)) === openId)
    const first = inside[0] && itemKey(inside[0]) === key
    const last = inside.at(-1) && itemKey(inside.at(-1)!) === key
    return {
      className: ['mx-4 sm:ml-12 border-x border-slate-200 bg-white', first ? 'rounded-t-[10px] border-t' : 'border-t', last ? 'rounded-b-[10px] border-b' : ''].join(' '),
    }
  }

  return (
    <DragList
      items={items}
      keyOf={itemKey}
      nameOf={(i) => ('box' in i ? i.box.title : 'field' in i ? byKey.get(i.field)?.label || 'New field' : '')}
      canMove={(next) => orderProblem(items, next, page) === null}
      onReorder={(next) => {
        const read = readOrder(items, next, parts, page)
        onChange(read.parts, read.order)
      }}
      slot={slot}
    >
      {(item, row) => {
        if ('box' in item) {
          const box = item.box
          const open = box.id === openId
          const renames = boxRenames(box, page)
          return (
            <OrderRow
              row={box.moves ? row : still(row)}
              name={box.title || 'New box'}
              line={boxLine(box, page) || (box.id === 'top' ? topLine : undefined)}
              open={open}
              onToggle={() => onOpen(open ? null : box.id)}
              rename={renames ? { ...boxName(page, box), onChange: (t) => onRename(box.id, t), fresh: box.id === freshId } : undefined}
            />
          )
        }
        if ('end' in item) {
          const box = boxes.find((b) => b.id === item.end)!
          const add = (
            <button type="button" onClick={() => onAddField(box.id)} className={addButton}>
              + Add a field
            </button>
          )
          const empty = box.fields.length === 0 && !box.basics?.length && <span className="block pb-2.5 text-[13px] text-slate-500">Nothing in it yet</span>
          // Every box but Top and "Not on the listing" comes off, its fields
          // with it (the user, Nov 10).
          if (box.moves)
            return (
              <div>
                {empty}
                <RowActions name={box.title || 'New box'} onRemove={() => onRemoveBox(box.id)}>
                  {add}
                </RowActions>
              </div>
            )
          return box.id === 'top' ? <div>{add}</div> : <div className="h-1" />
        }
        if ('basic' in item) {
          const name = item.basic === 'address' ? 'Address' : 'Phone'
          return <Inner row={still(row)} name={name} line={item.basic === 'address' ? 'Puts the page on the map' : undefined} onOpen={() => onShowBasic(item.basic)} />
        }
        const f = byKey.get(item.field)
        return (
          <Inner
            row={hidden.has(item.field) ? still(row) : row}
            name={f?.label || 'New field'}
            line={f && fieldLine(f)}
            onOpen={() => onShowField(item.field)}
          />
        )
      }}
    </DragList>
  )
}

/** A field in an opened box: its handle, name and line, and a chevron to
 *  its own screen. */
function Inner({ row, name, line, onOpen }: { row: DragRow; name: string; line?: string; onOpen: () => void }) {
  return (
    <div className="flex min-h-12 items-center gap-1 pl-1 pr-2">
      {row.handle}
      <button type="button" onClick={onOpen} {...row.rowProps} className="flex min-h-12 min-w-0 flex-1 cursor-pointer select-none items-center gap-2 py-2 text-left">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-medium text-slate-900">{name}</span>
          {line && <span className="text-[13px] text-slate-600">{line}</span>}
        </span>
        <Chevron />
      </button>
    </div>
  )
}
