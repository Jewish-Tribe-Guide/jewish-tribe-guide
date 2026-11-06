'use client'

import type { CategoryField } from '@/lib/categories'
import { automaticLines, cardFieldLine, lineChoices, lineSummary, photoOnCard, secondLineFields, thirdLineFields, type CardPage } from '@/lib/cardLines'
import { initialsOf } from '@/lib/listingRow'
import { AdminBack, AdminBox, AdminRow } from './AdminUI'
import DragList, { addButton, InnerRow, OrderRow, type DragRow } from './DragList'

// Site → Category pages → a page → Before it's opened (boards 20-22): the
// card a place is listed on, as a sample with the line open outlined, then
// a row for each of its three lines, opening in place to what's on it.
// What the card works out for itself says "Automatic"; a field chosen for
// it has a handle and an ×, and "+ Show a field" adds another (board 23).

export type CardLine = 'first' | 'second' | 'third'

const NO_HANDLE = <span aria-hidden="true" className="h-11 w-8 shrink-0" />
const STILL: DragRow = { handle: NO_HANDLE, rowProps: { onPointerDown: () => {}, onContextMenu: () => {} }, lifted: false }
const LINE_NAMES: Record<CardLine, string> = { first: 'First line', second: 'Second line', third: 'Third line' }

type Item = { auto: string } | { photo: true } | { field: CategoryField }
const keyOf = (i: Item) => ('auto' in i ? `auto:${i.auto}` : 'photo' in i ? 'photo' : i.field.key)

export default function CardBox({
  page,
  sampleName,
  open,
  onOpen,
  onField,
  onOrder,
  onShow,
}: {
  page: CardPage
  /** "A restaurant", the sample's name. */
  sampleName: string
  open: CardLine | null
  onOpen: (line: CardLine | null) => void
  /** Putting a field on the card or taking it off. */
  onField: (key: string, on: boolean) => void
  /** A line's chosen fields, in their new order. */
  onOrder: (keys: string[]) => void
  /** "+ Show a field": board 23's screen, for that line. */
  onShow: (line: 'second' | 'third') => void
}) {
  const auto = automaticLines(page)
  const photoField = page.fields.find((f) => f.type === 'image')
  const chosen = { second: secondLineFields(page.fields), third: thirdLineFields(page.fields) }
  const summary = (['first', 'second', 'third'] as const).map((l) => lineSummary(page, l)).join(' · ')

  function lineItems(line: CardLine): Item[] {
    if (line === 'first') return [...(photoField && photoOnCard(page.fields) ? [{ photo: true } as const] : []), ...auto.first.map((a) => ({ auto: a }))]
    return [...auto[line].map((a) => ({ auto: a })), ...chosen[line].map((field) => ({ field }))]
  }

  return (
    <AdminBox title="Before it’s opened" foldOnPhone defaultOpen={open !== null} summary={summary}>
      <div className="bg-slate-50 px-4 py-4 border-b border-slate-100">
        <Sample page={page} name={sampleName} outline={open} />
      </div>
      {(['first', 'second', 'third'] as const).map((line) => {
        const isOpen = open === line
        const items = lineItems(line)
        const autos = items.filter((i) => 'auto' in i || 'photo' in i).length
        const more = line !== 'first' && lineChoices(page.fields, line).length > 0
        return (
          <OrderRow
            key={line}
            row={STILL}
            name={LINE_NAMES[line]}
            line={lineSummary(page, line)}
            openLine={line === 'third' ? 'The first that applies' : undefined}
            open={isOpen}
            onToggle={() => onOpen(isOpen ? null : line)}
          >
            {isOpen && items.length > 0 && (
              <DragList
                items={items}
                keyOf={keyOf}
                nameOf={(i) => ('auto' in i ? i.auto : 'photo' in i ? 'Photo' : i.field.label)}
                // What the card works out for itself stays first.
                canMove={(next) => next.slice(0, autos).every((i) => !('field' in i))}
                onReorder={(next) => onOrder(next.flatMap((i) => ('field' in i ? [i.field.key] : [])))}
                slot={(_i, n) => ({ className: n > 0 ? 'border-t border-slate-100' : '' })}
                className="rounded-[10px] border border-slate-200 bg-white"
              >
                {(item, row) =>
                  'auto' in item ? (
                    <Automatic name={item.auto} />
                  ) : 'photo' in item ? (
                    <InnerRow row={STILL} name="Photo" line="Initials when it’s off" onRemove={() => onField(photoField!.key, false)} className="bg-white" />
                  ) : (
                    <InnerRow row={row} name={item.field.label} line={cardFieldLine(item.field)} onRemove={() => onField(item.field.key, false)} className="bg-white" />
                  )
                }
              </DragList>
            )}
            {isOpen && line === 'first' && photoField && !photoOnCard(page.fields) && (
              <button type="button" onClick={() => onField(photoField.key, true)} className={`${addButton} self-start`}>
                + Show the photo
              </button>
            )}
            {isOpen && more && (
              <button type="button" onClick={() => onShow(line as 'second' | 'third')} className={`${addButton} self-start`}>
                + Show a field
              </button>
            )}
          </OrderRow>
        )
      })}
    </AdminBox>
  )
}

function Automatic({ name }: { name: string }) {
  return (
    <div className="flex min-h-11 items-center gap-1 pl-1 pr-1">
      {NO_HANDLE}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-2">
        <span className="text-[15px] font-medium text-slate-900">{name}</span>
        <span className="text-[13px] text-slate-600">Automatic</span>
      </span>
    </div>
  )
}

const outlined = 'rounded-[5px] outline-2 outline-primary outline-offset-1'

/** The card, filled in as a place on the page would fill it: each choice
 *  its first option, a short line its name. */
function Sample({ page, name, outline }: { page: CardPage; name: string; outline: CardLine | null }) {
  const has = (type: CategoryField['type']) => page.fields.some((f) => f.type === type)
  const facts = [
    ...(has('hours') ? [{ text: 'Open until 8 PM', open: true }] : []),
    ...(page.hasAddress ? [{ text: '0.4 mi', open: false }] : []),
    ...secondLineFields(page.fields).map((f) => ({ text: f.type === 'select' ? (f.options?.[0]?.label ?? f.label) : (f.filterLabel ?? f.label), open: false })),
  ]
  const third = thirdLineFields(page.fields)[0]?.label ?? 'Not confirmed by anyone yet'
  const photo = page.fields.some((f) => f.type === 'image') && photoOnCard(page.fields)
  return (
    <div aria-hidden="true" className="flex max-w-[520px] items-start gap-3 rounded-[10px] border border-slate-200 bg-white px-3 py-3">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[14px] font-bold text-slate-600 ${photo ? 'bg-slate-200' : 'bg-slate-100'} ${outline === 'first' ? outlined : ''}`}
      >
        {initialsOf(name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`flex items-baseline gap-2 ${outline === 'first' ? outlined : ''}`}>
          <span className="min-w-0 flex-1 truncate">
            <b className="text-[15px] text-slate-900">{name}</b>
            {page.hasAddress && <span className="text-[13.5px] text-slate-500"> · Neighborhood</span>}
          </span>
          {page.upvotes && (
            <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-slate-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
                <path d="M7 10v12" />
                <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
              </svg>
              12
            </span>
          )}
        </span>
        <span className={`truncate text-[13.5px] text-slate-600 ${outline === 'second' ? outlined : ''}`}>
          {facts.length
            ? facts.map((f, i) => (
                <span key={`${f.text}:${i}`}>
                  {i > 0 && ' · '}
                  <span className={f.open ? 'text-green-700' : ''}>{f.text}</span>
                </span>
              ))
            : ' '}
        </span>
        <span className={`truncate text-[14px] font-medium text-slate-800 ${outline === 'third' ? outlined : ''}`}>{third}</span>
      </span>
    </div>
  )
}

/** Board 23: what could go on a line, those on the card already marked. */
export function ShowOnLine({
  line,
  fields,
  back,
  onPick,
}: {
  line: 'second' | 'third'
  fields: readonly CategoryField[]
  back: { label: string; onClick: () => void }
  onPick: (key: string) => void
}) {
  const on = new Set((line === 'second' ? secondLineFields : thirdLineFields)(fields).map((f) => f.key))
  const kind = (f: CategoryField) => (f.type === 'boolean' ? 'Yes or no' : f.type === 'select' ? 'Choice' : 'Text')
  return (
    <>
      <AdminBack back={back} title={`Show on the ${line} line`} />
      <AdminBox>
        {lineChoices(fields, line).map((f) =>
          on.has(f.key) ? (
            <div key={f.key} className="flex min-h-[52px] items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-slate-900">{f.label}</span>
                <span className="text-[13px] text-slate-600">{kind(f)}</span>
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-semibold text-slate-700">On the card</span>
            </div>
          ) : (
            <AdminRow key={f.key} onClick={() => onPick(f.key)} name={f.label} line={kind(f)} />
          ),
        )}
      </AdminBox>
    </>
  )
}
