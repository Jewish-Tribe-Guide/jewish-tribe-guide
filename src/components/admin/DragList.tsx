'use client'

import { Children, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dropIndex, moveItem } from '@/lib/reorder'
import { Chevron } from './AdminUI'

// One list put in order by dragging (the user, Nov 4: "Could this be drag
// instead of arrows?"; drawing KdHT8Tci1ufXSXobnnSfEm). Used by every list
// on Site → Header and menus: the cards, the groups and their cards, the
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

type Drag = { key: string; pointerId: number; startY: number; startTop: number; dy: number; moved: boolean }

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
}: {
  items: readonly T[]
  keyOf: (item: T) => string
  nameOf: (item: T) => string
  onReorder: (next: T[]) => void
  children: (item: T, row: DragRow) => React.ReactNode
  className?: string
}) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const [order, setOrder] = useState<string[] | null>(null)
  const els = useRef(new Map<string, HTMLDivElement>())
  const dragRef = useRef<Drag | null>(null)
  const orderRef = useRef<string[] | null>(null)
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; pointerId: number } | null>(null)
  const swallowClick = useRef(false)
  const latest = useRef({ items, keyOf, onReorder })
  useEffect(() => {
    latest.current = { items, keyOf, onReorder }
  })

  const byKey = new Map(items.map((i) => [keyOf(i), i]))
  const shown = order ? order.map((k) => byKey.get(k)).filter((i): i is T => i !== undefined) : items

  // The handlers are made once: a window listener added on one render is
  // removed by the same function on another.
  const h = useMemo(() => {
    // The lifted row sits under the finger wherever its slot has moved to.
    function place() {
      const d = dragRef.current
      const el = d && els.current.get(d.key)
      if (d && el) el.style.transform = `translateY(${d.startTop + d.dy - el.offsetTop}px)`
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
      const d: Drag = { key, pointerId, startY: clientY, startTop: el.offsetTop, dy: 0, moved: false }
      dragRef.current = d
      orderRef.current = latest.current.items.map(latest.current.keyOf)
      setOrder(orderRef.current)
      setDrag(d)
      document.body.style.userSelect = 'none'
      listen(true)
    }
    function move(e: PointerEvent) {
      const d = dragRef.current
      const cur = orderRef.current
      if (!d || !cur || e.pointerId !== d.pointerId) return
      d.dy = e.clientY - d.startY
      if (Math.abs(d.dy) > 2) d.moved = true
      const el = els.current.get(d.key)
      if (!el) return
      const middles = cur
        .filter((k) => k !== d.key)
        .map((k) => {
          const o = els.current.get(k)
          return o ? o.offsetTop + o.offsetHeight / 2 : 0
        })
      const to = dropIndex(middles, d.startTop + d.dy + el.offsetHeight / 2)
      const from = cur.indexOf(d.key)
      if (to !== from) {
        orderRef.current = moveItem(cur, from, to)
        setOrder(orderRef.current)
      }
      place()
    }
    function end(e: PointerEvent) {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      listen(false)
      document.body.style.userSelect = ''
      const el = els.current.get(d.key)
      if (el) el.style.transform = ''
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
              const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null
              if (to === null) return
              e.preventDefault()
              if (to >= 0 && to < items.length) onReorder(moveItem(items, i, to))
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
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) els.current.set(key, el)
              else els.current.delete(key)
            }}
            data-drag-row={key}
            className={`[-webkit-touch-callout:none] ${lifted ? 'relative z-10 rounded-[10px] bg-white shadow-[0_10px_24px_rgb(15_23_42/0.18)] ring-1 ring-primary' : ''}`}
          >
            {children(item, { handle, rowProps, lifted })}
          </div>
        )
      })}
    </div>
  )
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
export function RowActions({ name, onRemove, children }: { name: string; onRemove: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
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

const iconButton = 'grid h-11 w-10 shrink-0 cursor-pointer place-items-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-800'

/** A row's name, edited in the row itself while it's open (the user, Nov 4:
 *  "Do we need two places that say new tab?"). */
export type RowRename = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Just added: the name is selected, ready to type over. */
  fresh?: boolean
}

/** Open, the name reads as the name; a tap on it edits it, and leaving
 *  the box (or Enter) puts it back (the user, Nov 4: "being able to edit the
 *  name right away is a throw off"). Just added, it starts in the box. */
function RowName({ rename, name }: { rename: RowRename; name: string }) {
  const [editing, setEditing] = useState(!!rename.fresh)
  // The box's padding hangs to the left, so the name sits where it did closed.
  const pad = '-ml-2.5 rounded-md border px-2.5 py-1.5 text-[15px] font-semibold'
  if (!editing)
    return (
      <button
        type="button"
        aria-label={`Rename ${name}`}
        onClick={() => setEditing(true)}
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
  children,
}: {
  row: DragRow
  name: string
  line?: React.ReactNode
  icon?: React.ReactNode
  open: boolean
  onToggle: () => void
  rename?: RowRename
  /** What it opens to. */
  children?: React.ReactNode
}) {
  // The row is named by its name alone; its line describes it.
  const lineId = useId()
  useEffect(listenForPresses, [])
  const toggle = () => !typingAtPress && onToggle()
  const iconBox = icon && <span className="grid h-7 w-7 shrink-0 place-items-center text-slate-600">{icon}</span>
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
          </span>
          <span className={open ? 'rotate-90' : ''}>
            <Chevron />
          </span>
        </button>
        )}
      </div>
      {open && Children.toArray(children).length > 0 && <div className="flex flex-col gap-3 px-4 pb-4 pt-1 sm:pl-10">{children}</div>}
    </div>
  )
}

/** A row inside an opened row (a heading's links, a dropdown's links): the
 *  handle, its name, a line under it when there's one, and an × to take it
 *  off. It doesn't open (the drawing; the user, Nov 4: "why are links like
 *  that"). */
export function InnerRow({ row, name, line, onRemove }: { row: DragRow; name: string; line?: string; onRemove: () => void }) {
  return (
    <div className={`border-b border-slate-100 bg-white last:border-b-0 ${row.lifted ? 'border-transparent' : ''}`}>
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
 *  can be added (a phone's own picker), with no ▾ (the user, Nov 4). */
export function AddMenu({ label, options, onPick }: { label: string; options: { id: string; label: string }[]; onPick: (id: string) => void }) {
  if (options.length === 0) return null
  return (
    <label className={`relative ${addButton}`}>
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
