'use client'

import { Children, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dropIndex, moveItem } from '@/lib/reorder'
import { Chevron } from './AdminUI'

// One list put in order by dragging (the user, Nov 4: "Could this be drag
// instead of arrows?"; drawing KdHT8Tci1ufXSXobnnSfEm). Used by every list
// on Site → Home page: the cards, the groups and their cards, the
// top of the page and its dropdowns, and the phone's tabs.
//
// A row is dragged by its handle, or on a phone by pressing and holding the
// row itself; a tap still opens it. The lifted row follows the finger and
// the others make room as it passes their middle. With a keyboard, the
// handle moves its row with the up and down arrows.

/** How long a finger rests on a row before it lifts. */
const HOLD_MS = 450
/** Further than this and the finger is scrolling, not holding. */
const HOLD_SLOP = 8
/** A row held this near the top or bottom of the window scrolls the page
 *  (the user, Nov 10: "The screen didn't drag down as I was moving the
 *  field down"); the bottom's is taller, for the Save bar over it. */
const EDGE_TOP = 64
const EDGE_BOTTOM = 112
/** The most the page scrolls in a frame, at the very edge. */
const EDGE_SPEED = 18

/** How far the page scrolls this frame for a pointer at `clientY` in a
 *  window `height` tall, lifted at `startY`: none away from the edges,
 *  faster nearer them, and only the way the row is being taken (one lifted
 *  near an edge and taken the other way doesn't scroll). */
export function edgeScroll(clientY: number, height: number, startY: number): number {
  if (clientY < EDGE_TOP && clientY < startY) return -Math.ceil(EDGE_SPEED * Math.min(1, (EDGE_TOP - clientY) / EDGE_TOP))
  const from = height - EDGE_BOTTOM
  if (clientY > from && clientY > startY) return Math.ceil(EDGE_SPEED * Math.min(1, (clientY - from) / EDGE_BOTTOM))
  return 0
}

const GRIP = (
  <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
    <circle cx="4" cy="4" r="1.6" />
    <circle cx="10" cy="4" r="1.6" />
    <circle cx="4" cy="9" r="1.6" />
    <circle cx="10" cy="9" r="1.6" />
    <circle cx="4" cy="14" r="1.6" />
    <circle cx="10" cy="14" r="1.6" />
  </svg>
)

type Drag = {
  key: string
  pointerId: number
  /** Where the pointer is, and how far the drag has scrolled the page:
   *  the row follows both. Only its own scrolling: the browser moving the
   *  page as rows reflow above isn't the row moving. */
  clientY: number
  scrolled: number
  startY: number
  startTop: number
  dy: number
  moved: boolean
  /** The rows that move with it (`carries`), and where each started. */
  block?: string[]
  starts?: Map<string, number>
  /** With dropEdge: where each other row is passed, measured as the row was
   *  lifted. */
  lines?: Map<string, number>
}

export type DragRow = {
  /** The handle, first in the row. */
  handle: React.ReactNode
  /** For the row's own button: holding it on a phone lifts the row. */
  rowProps: { onPointerDown: (e: React.PointerEvent) => void; onContextMenu: (e: React.MouseEvent) => void }
  lifted: boolean
}

export default function DragList<T>({
  items,
  keyOf,
  nameOf,
  onReorder,
  children,
  className = '',
  canMove,
  slot,
  dropEdge,
  carries,
}: {
  items: readonly T[]
  keyOf: (item: T) => string
  nameOf: (item: T) => string
  onReorder: (next: T[]) => void
  children: (item: T, row: DragRow) => React.ReactNode
  className?: string
  /** False for an order a row can't take: the lifted row skips past it.
   *  `via` is 'key' for an arrow press, which also skips an order that
   *  looks no different. */
  canMove?: (next: T[], via: 'pointer' | 'key') => boolean
  /** The spot a row sits in, which stays put while the row is lifted: its
   *  class, and a note under the row. The home cards draw their rows' boxes
   *  with it. `refused` is the order the lifted row was last held at and
   *  canMove turned down, while it's still held there; null otherwise. */
  slot?: (item: T, i: number, shown: readonly T[], dragKey: string | null, refused: readonly T[] | null) => { className: string; note?: React.ReactNode }
  /** Where a lifted row passes this one: its middle (undefined), or its
   *  top or bottom edge, measured as the row is lifted. The home cards'
   *  gaps use their outer edges, so the whole space between two boxes is
   *  "a row of its own". */
  dropEdge?: (item: T) => 'top' | 'bottom' | undefined
  /** The rows under this one that move with it, as one (a box's fields
   *  under its head: Fields, board E1b). */
  carries?: (item: T, items: readonly T[]) => string[]
}) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const [order, setOrder] = useState<string[] | null>(null)
  // Where the lifted row is held and can't go (see `slot`).
  const [refused, setRefused] = useState<string[] | null>(null)
  const els = useRef(new Map<string, HTMLDivElement>())
  const dragRef = useRef<Drag | null>(null)
  const orderRef = useRef<string[] | null>(null)
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; pointerId: number } | null>(null)
  const swallowClick = useRef(false)
  const latest = useRef({ items, keyOf, onReorder, canMove, dropEdge, carries })
  useEffect(() => {
    latest.current = { items, keyOf, onReorder, canMove, dropEdge, carries }
  })

  const byKey = new Map(items.map((i) => [keyOf(i), i]))
  const shown = order ? order.map((k) => byKey.get(k)).filter((i): i is T => i !== undefined) : items
  const refusedItems = refused && drag ? refused.map((k) => byKey.get(k)).filter((i): i is T => i !== undefined) : null

  // The handlers are made once: a window listener added on one render is
  // removed by the same function on another.
  const h = useMemo(() => {
    // The lifted row sits under the finger wherever its slot has moved to.
    function place() {
      const d = dragRef.current
      if (!d) return
      for (const k of d.block ?? [d.key]) {
        const el = els.current.get(k)
        const start = d.starts?.get(k) ?? d.startTop
        if (el) el.style.transform = `translateY(${start + d.dy - el.offsetTop}px)`
      }
    }
    function stopScroll(e: TouchEvent) {
      if (dragRef.current) e.preventDefault()
    }
    function listen(on: boolean) {
      if (on) {
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', end)
        window.addEventListener('pointercancel', end)
        // A finger that lifted a row mustn't scroll the page as well.
        window.addEventListener('touchmove', stopScroll, { passive: false })
      } else {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
        window.removeEventListener('touchmove', stopScroll)
      }
    }
    function begin(key: string, pointerId: number, clientY: number) {
      const el = els.current.get(key)
      if (!el || dragRef.current) return
      const d: Drag = { key, pointerId, clientY, scrolled: 0, startY: clientY, startTop: el.offsetTop, dy: 0, moved: false }
      const { items: all, keyOf: keyOfItem, dropEdge: edgeOf, carries: carriedBy } = latest.current
      const self = all.find((i) => keyOfItem(i) === key)
      const carried = self && carriedBy ? carriedBy(self, all) : []
      if (carried.length) {
        d.block = [key, ...carried]
        d.starts = new Map(d.block.map((k) => [k, els.current.get(k)?.offsetTop ?? 0]))
      }
      if (edgeOf) {
        // Measured once, as it was lifted: rows of different heights (a box
        // shrinking as a card leaves it) would otherwise move the lines
        // under the card mid-drag. For rows all one height it's the same.
        d.lines = new Map()
        for (const item of all) {
          const k = keyOfItem(item)
          const o = els.current.get(k)
          if (k === key || !o) continue
          const edge = edgeOf(item)
          d.lines.set(k, o.offsetTop + (edge === 'top' ? 0 : edge === 'bottom' ? o.offsetHeight : o.offsetHeight / 2))
        }
      }
      dragRef.current = d
      orderRef.current = latest.current.items.map(latest.current.keyOf)
      setOrder(orderRef.current)
      setDrag(d)
      document.body.style.userSelect = 'none'
      listen(true)
    }
    function move(e: PointerEvent) {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      d.clientY = e.clientY
      follow()
      if (!scrolling && edgeScroll(d.clientY, window.innerHeight, d.startY)) scrolling = requestAnimationFrame(scrollStep)
    }
    // Near an edge, the page scrolls a little each frame while the row is
    // held there, and the row keeps up.
    let scrolling = 0
    function scrollStep() {
      scrolling = 0
      const d = dragRef.current
      if (!d) return
      const by = edgeScroll(d.clientY, window.innerHeight, d.startY)
      if (!by) return
      const was = window.scrollY
      window.scrollBy(0, by)
      if (window.scrollY === was) return
      d.scrolled += window.scrollY - was
      follow()
      scrolling = requestAnimationFrame(scrollStep)
    }
    function follow() {
      const d = dragRef.current
      const cur = orderRef.current
      if (!d || !cur) return
      d.dy = d.clientY - d.startY + d.scrolled
      if (Math.abs(d.dy) > 2) d.moved = true
      const el = els.current.get(d.key)
      if (!el) return
      const block = d.block ?? [d.key]
      const last = els.current.get(block.at(-1)!) ?? el
      const height = (d.starts?.get(block.at(-1)!) ?? d.startTop) + last.offsetHeight - d.startTop
      const middles = cur
        .filter((k) => !block.includes(k))
        .map((k) => {
          const line = d.lines?.get(k)
          if (line !== undefined) return line
          const o = els.current.get(k)
          return o ? o.offsetTop + o.offsetHeight / 2 : 0
        })
      const to = dropIndex(middles, d.startTop + d.dy + height / 2)
      const from = cur.indexOf(d.key)
      let turnedDown: string[] | null = null
      if (to !== from) {
        const next = moveBlock(cur, block, to)
        const { items: now, keyOf: keyFor, canMove: allowed } = latest.current
        const byKey = new Map(now.map((i) => [keyFor(i), i]))
        if (!allowed || allowed(next.map((k) => byKey.get(k)!), 'pointer')) {
          orderRef.current = next
          setOrder(next)
        } else turnedDown = next
      }
      setRefused((was) => (was?.join('\n') === turnedDown?.join('\n') ? was : turnedDown))
      place()
    }
    function end(e: PointerEvent) {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      listen(false)
      cancelAnimationFrame(scrolling)
      scrolling = 0
      document.body.style.userSelect = ''
      for (const k of d.block ?? [d.key]) {
        const el = els.current.get(k)
        if (el) el.style.transform = ''
      }
      const { items: now, keyOf: keyFor, onReorder: done } = latest.current
      const next = orderRef.current
      if (next && next.join('\n') !== now.map(keyFor).join('\n')) {
        const map = new Map(now.map((i) => [keyFor(i), i]))
        done(next.map((k) => map.get(k)).filter((i): i is T => i !== undefined))
      }
      if (d.moved) swallowClick.current = true
      dragRef.current = null
      orderRef.current = null
      setDrag(null)
      setOrder(null)
      setRefused(null)
    }
    function cancelHold() {
      if (!hold.current) return
      clearTimeout(hold.current.timer)
      hold.current = null
      window.removeEventListener('pointermove', holdMove)
      window.removeEventListener('pointerup', cancelHold)
      window.removeEventListener('pointercancel', cancelHold)
    }
    function holdMove(e: PointerEvent) {
      const held = hold.current
      if (held && e.pointerId === held.pointerId && Math.hypot(e.clientX - held.x, e.clientY - held.y) > HOLD_SLOP) cancelHold()
    }
    function startHold(key: string, pointerId: number, x: number, y: number) {
      cancelHold()
      hold.current = {
        x,
        y,
        pointerId,
        timer: setTimeout(() => {
          cancelHold()
          swallowClick.current = true
          navigator.vibrate?.(10)
          begin(key, pointerId, y)
        }, HOLD_MS),
      }
      window.addEventListener('pointermove', holdMove)
      window.addEventListener('pointerup', cancelHold)
      window.addEventListener('pointercancel', cancelHold)
    }
    function stop() {
      cancelHold()
      listen(false)
      cancelAnimationFrame(scrolling)
      document.body.style.userSelect = ''
    }
    return { place, begin, startHold, stop }
  }, [])

  useLayoutEffect(() => h.place(), [h, order, drag])
  // Unmounting mid-drag leaves nothing listening.
  useEffect(() => h.stop, [h])

  return (
    <div
      className={`relative ${className}`}
      // A drag that ended with no click after it leaves nothing to swallow.
      onPointerDownCapture={() => {
        if (!dragRef.current) swallowClick.current = false
      }}
      onClickCapture={(e) => {
        // The tap that ends a drag isn't a tap on the row.
        if (!swallowClick.current) return
        swallowClick.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {shown.map((item, i) => {
        const key = keyOf(item)
        const lifted = drag?.key === key
        const carried = !lifted && !!drag?.block?.includes(key)
        const name = nameOf(item)
        const handle = (
          <button
            type="button"
            aria-label={`Move ${name}`}
            aria-keyshortcuts="ArrowUp ArrowDown"
            title="Drag to move"
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              swallowClick.current = false
              h.begin(key, e.pointerId, e.clientY)
            }}
            onKeyDown={(e) => {
              const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : null
              if (step === null) return
              e.preventDefault()
              // The nearest place it can go that way, with what it carries.
              const block = [key, ...(carries?.(item, items) ?? [])]
              const room = items.length - block.length
              for (let to = i + step; to >= 0 && to <= room; to += step) {
                const next = block.length > 1 ? moveBlock(items.map(keyOf), block, to).map((k) => byKey.get(k)!) : moveItem(items, i, to)
                if (canMove && !canMove(next, 'key')) continue
                onReorder(next)
                break
              }
            }}
            className={`grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-md hover:bg-slate-100 ${lifted ? 'cursor-grabbing text-primary' : 'text-slate-400'}`}
          >
            {GRIP}
          </button>
        )
        const rowProps: DragRow['rowProps'] = {
          onPointerDown: (e) => {
            if (e.pointerType === 'touch' && !drag) h.startHold(key, e.pointerId, e.clientX, e.clientY)
          },
          // A held finger opens no "copy / share" menu over the row.
          onContextMenu: (e) => {
            if ((e.nativeEvent as PointerEvent).pointerType === 'touch') e.preventDefault()
          },
        }
        const row = (
          <div
            key={key}
            ref={(el) => {
              if (el) els.current.set(key, el)
              else els.current.delete(key)
            }}
            data-drag-row={key}
            className={`[-webkit-touch-callout:none] ${lifted ? 'relative z-10 rounded-[10px] bg-white shadow-[0_10px_24px_rgb(15_23_42/0.18)] ring-1 ring-primary' : carried ? 'relative z-10 bg-white' : ''}`}
          >
            {children(item, { handle, rowProps, lifted })}
          </div>
        )
        if (!slot) return row
        const { className: slotClassName, note } = slot(item, i, shown, drag?.key ?? null, refusedItems)
        return (
          <div key={key} className={slotClassName}>
            {row}
            {note}
          </div>
        )
      })}
    </div>
  )
}

/** The order with `block` (contiguous, its first the lifted row) taken out
 *  and put back at `to`, counted among the rows left. */
function moveBlock(order: readonly string[], block: readonly string[], to: number): string[] {
  const rest = order.filter((k) => !block.includes(k))
  return [...rest.slice(0, to), ...block, ...rest.slice(to)]
}

const TRASH = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
)

const trashButton =
  'grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-slate-300 bg-white text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600'

/** The bottom of an open row: what can go in (its Adds, a width), then the
 *  trash can right after them (the user, Nov 4: "move the garbage down to
 *  where we have those add buttons", and not off at the far end). */
export function RowActions({ name, onRemove, children, wide }: { name: string; onRemove: () => void; children?: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'flex flex-1 items-center gap-2.5' : 'flex flex-wrap items-center gap-2.5'}>
      {children}
      <button type="button" onClick={onRemove} aria-label={`Take ${name} off`} className={trashButton}>
        {TRASH}
      </button>
    </div>
  )
}

// Typing in a name, a press elsewhere only finishes the typing: it doesn't
// also open or close a row (the user, Nov 4: "When something is in focus and
// we click away we still allow another action"). Read at the press, before
// the box loses focus. One listener for the page.
let typingAtPress = false
let pressListening = false
function listenForPresses() {
  if (pressListening) return
  pressListening = true
  document.addEventListener(
    'pointerdown',
    () => {
      const el = document.activeElement
      typingAtPress = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(el.type))
    },
    true,
  )
}

/** A whole bar that opens and closes, as a row's does: a press on a button,
 *  link or box in it does its own thing, and a press that only finishes
 *  typing a name does nothing (the user, Nov 10: "we want the top part"). */
export function useBarToggle() {
  useEffect(listenForPresses, [])
  return (e: React.MouseEvent, onToggle: () => void) => {
    if (typingAtPress || (e.target as HTMLElement).closest('input, textarea, button, select, a')) return
    onToggle()
  }
}

const iconButton = 'grid h-11 w-10 shrink-0 cursor-pointer place-items-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-800'

/** A row's name, edited in the row itself while it's open (the user, Nov 4:
 *  "Do we need two places that say new tab?"). */
export type RowRename = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Just added: the name is selected, ready to type over. */
  fresh?: boolean
  /** Tapped to rename, in place of editing here: the row is about to be
   *  another's (a box of the listing's own becoming the admin's), which
   *  then starts `fresh`. */
  onStart?: () => void
}

/** Open, the name reads as the name; a tap on it edits it, and leaving
 *  the box (or Enter) puts it back (the user, Nov 4: "being able to edit the
 *  name right away is a throw off"). Just added, it starts in the box. */
export function RowName({ rename, name }: { rename: RowRename; name: string }) {
  const [editing, setEditing] = useState(!!rename.fresh)
  // The box's padding hangs to the left, so the name sits where it did closed.
  const pad = '-ml-2.5 rounded-md border px-2.5 py-1.5 text-[15px] font-semibold'
  if (!editing)
    return (
      <button
        type="button"
        aria-label={`Rename ${name}`}
        onClick={() => (rename.onStart ? rename.onStart() : setEditing(true))}
        className={`${pad} min-w-0 cursor-text truncate border-transparent text-left text-slate-900 hover:border-slate-200 hover:bg-slate-50`}
      >
        {rename.value || <span className="text-slate-400">{rename.placeholder}</span>}
      </button>
    )
  return (
    <input
      aria-label="Name"
      value={rename.value}
      placeholder={rename.placeholder}
      autoFocus
      onFocus={(e) => rename.fresh && e.target.select()}
      onChange={(e) => rename.onChange(e.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
      // As wide as the name, so the rest of the row is there to tap closed.
      size={Math.max(rename.value.length || (rename.placeholder?.length ?? 0), 6) + 2}
      className={`${pad} min-w-0 max-w-full border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary`}
    />
  )
}

/** A row of a drag list, as drawn: the handle, a name with one line under
 *  it, and a chevron; it opens in place, under itself. Open, the line goes,
 *  since what it summed up is showing under it; its name is edited in the
 *  row (`rename`); and a tap anywhere in the row but its name and buttons
 *  closes it (the user, Nov 4: "hard to close the thing once it's open").
 *  Its trash can is in its `RowActions`, at the bottom. */
export function OrderRow({
  row,
  name,
  line,
  icon,
  open,
  onToggle,
  rename,
  openLine,
  onRemove,
  children,
}: {
  row: DragRow
  name: string
  line?: React.ReactNode
  /** Its line while it's open, when it has one then ("The first that
   *  applies"). */
  openLine?: string
  icon?: React.ReactNode
  open: boolean
  onToggle: () => void
  rename?: RowRename
  /** An X at the end of its name bar: given only while it's empty, as a
   *  field box's X is (the user, Nov 10). */
  onRemove?: () => void
  /** What it opens to. */
  children?: React.ReactNode
}) {
  // The row is named by its name alone; its line describes it.
  const lineId = useId()
  useEffect(listenForPresses, [])
  const toggle = () => !typingAtPress && onToggle()
  const iconBox = icon && <span className="grid h-7 w-7 shrink-0 place-items-center text-slate-600">{icon}</span>
  const x = onRemove && (
    <button type="button" onClick={onRemove} aria-label={`Take ${name} off`} className={iconButton}>
      {X}
    </button>
  )
  return (
    <div className={`border-b border-slate-100 last:border-b-0 ${row.lifted ? 'border-transparent' : ''}`}>
      <div className="flex items-center pl-1.5 pr-2">
        {row.handle}
        {open && rename ? (
          <>
            {/* The chevron is the keyboard's way to close; this is the mouse's and a finger's. */}
            <div
              data-testid="open-row"
              onClick={(e) => !(e.target as HTMLElement).closest('input, button, select, a') && toggle()}
              className="flex min-h-[52px] min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 pl-1.5 pr-1"
            >
              {iconBox}
              <RowName rename={rename} name={name} />
            </div>
            <button type="button" aria-expanded aria-label={name} onClick={onToggle} className={`${iconButton} rotate-90`}>
              <Chevron />
            </button>
          </>
        ) : (
        <button
          type="button"
          aria-expanded={open}
          aria-describedby={line && !open ? lineId : undefined}
          onClick={toggle}
          {...row.rowProps}
          className="flex min-h-[52px] min-w-0 flex-1 cursor-pointer select-none items-center gap-2.5 py-2 pl-1.5 pr-2 text-left"
        >
          {iconBox}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-semibold text-slate-900">{name}</span>
            {line && !open && (
              <span id={lineId} aria-hidden className="text-[13px] text-slate-600">
                {line}
              </span>
            )}
            {open && openLine && <span className="text-[13px] text-slate-600">{openLine}</span>}
          </span>
          <span className={open ? 'rotate-90' : ''}>
            <Chevron />
          </span>
        </button>
        )}
        {/* Last, open or closed. */}
        {x}
      </div>
      {open && Children.toArray(children).length > 0 && <div className="flex flex-col gap-3 px-4 pb-4 pt-1 sm:pl-10">{children}</div>}
    </div>
  )
}

/** A row inside an opened row (a heading's links, a dropdown's links): the
 *  handle, its name, a line under it when there's one, and an × to take it
 *  off. It doesn't open (the drawing; the user, Nov 4: "why are links like
 *  that"). */
export function InnerRow({ row, name, line, onRemove, className }: { row: DragRow; name: string; line?: string; onRemove: () => void; className?: string }) {
  return (
    <div className={className ?? `border-b border-slate-100 bg-white last:border-b-0 ${row.lifted ? 'border-transparent' : ''}`}>
      <div className="flex min-h-11 items-center gap-1 pl-1 pr-1">
        {row.handle}
        <span {...row.rowProps} className="flex min-w-0 flex-1 select-none flex-col gap-0.5 py-2 text-left">
          <span className="text-[15px] font-medium text-slate-900">{name}</span>
          {line && <span className="text-[13px] text-slate-600">{line}</span>}
        </span>
        <button type="button" onClick={onRemove} aria-label={`Take ${name} off`} className={iconButton}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/** "+ Add a card" and the like: a button that opens the native list of what
 *  can be added (a phone's own picker), with no ▾ (the user, Nov 4). `wide`:
 *  under a whole list, as "+ Add a box" is (`addListButton`), its label
 *  without the "+", which the icon is. */
export function AddMenu({ label, options, onPick, wide, row }: { label: string; options: { id: string; label: string }[]; onPick: (id: string) => void; wide?: boolean; row?: boolean }) {
  if (options.length === 0) return null
  return (
    <label className={`relative ${wide ? addListButton : row ? addRowButton : addButton}`}>
      {(wide || row) && PLUS}
      {label}
      <select
        aria-label={label}
        value=""
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

const plainButton = 'inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold hover:bg-slate-50 cursor-pointer'
/** The plain white button of an opened row ("Take it off"). */
export const rowButton = `${plainButton} text-slate-900`
/** The same in blue, for adding ("+ Add a group"). */
export const addButton = `${plainButton} text-primary`

/** Adding one more to a whole list ("+ Add a box", "+ Add a tab", "+ Add a
 *  page"): a dashed button as wide as the list, a plus before its words, the
 *  same on every admin screen (the user, Nov 10: "Should we apply that to
 *  the site homepage part of admin?"). Adding inside one row stays that
 *  row's own button. */
export const addListButton =
  'flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-[15px] font-semibold text-primary hover:border-primary hover:bg-blue-50'

/** A box's or a tab's X (FieldBoxes, OrderRow). */
export const X = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const PLUS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

/** `addListButton` as a button. */
export function AddListButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${addListButton} disabled:cursor-default disabled:opacity-50 disabled:hover:border-slate-300 disabled:hover:bg-transparent`}>
      {PLUS}
      {children}
    </button>
  )
}

/** Adding inside one thing, as a field box's "Add a field" is: a row across
 *  the foot of its list, a plus before its words, lined up with the names
 *  above it (the user, Nov 10: "can add a link be the same as add a field
 *  in design?"). */
export const addRowButton =
  'flex min-h-[46px] w-full cursor-pointer items-center gap-2 pl-10 pr-4 text-left text-[15px] font-semibold text-primary hover:bg-blue-50/60'

/** `addRowButton` as a button. */
export function AddRowButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={addRowButton}>
      {PLUS}
      {children}
    </button>
  )
}

/** A list in a white card with its adds across its foot, as a field box is
 *  its fields and then "Add a field". */
export function ListCard({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">{children}</div>
}
