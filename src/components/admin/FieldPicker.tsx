'use client'

import { useMemo, useState } from 'react'
import type { CategoryField, FieldType } from '@/lib/categories'
import { useCommunitySlug } from '@/lib/communityContext'
import { basicField } from '@/lib/fieldAbout'
import { MAKE_OWN_KINDS, matchesSearch, pageMenu, readyMadeFields, type PageHas, type ReadyField } from '@/lib/readyMade'
import { AdminBack, AdminBox, AdminMenu, AdminRow, Chevron, MakeOwnLink, SearchBox } from './AdminUI'
import { normalizeField } from './categoryEditorLogic'
import { partnerRule } from '@/lib/fieldPartners'
import { FieldChanges, FieldTitle, WhatThisIs } from './FieldScreen'
import { useReadyMade } from './useReadyMade'

// "+ Add a field" (boards 7-12): every field on any community's pages, once
// each by name, to look at and add (board 11); a page menu narrows it to one
// page's (board 8). Make your own picks a kind (board 12).

/** Which of the picker's screens is open: the list, one field before
 *  adding it, or Make your own (with the name searched for, if any). */
export type FieldPickerScreen = { at: 'list' } | { at: 'look'; id: string } | { at: 'make'; name?: string }

export default function FieldPicker({
  token,
  pageName,
  pageLabel,
  page,
  screen,
  onScreen,
  onBack,
  onAdd,
  onMakeOwn,
  canRequire,
  besides,
}: {
  token: string
  /** The page being added to: "Food". */
  pageName: string
  /** One place on it: "Restaurant". */
  pageLabel: string
  page: PageHas
  screen: FieldPickerScreen
  onScreen: (next: FieldPickerScreen) => void
  onBack: () => void
  onAdd: (row: ReadyField) => void
  onMakeOwn: (type: FieldType, name: string) => void
  /** Visitors can add or edit places, so "required" means something. */
  canRequire: boolean
  /** The page beside, with the field on it (a computer only). */
  besides?: (field: CategoryField) => React.ReactNode
}) {
  const community = useCommunitySlug()
  const { pages, error } = useReadyMade(token, community)
  const [query, setQuery] = useState('')
  const [onPage, setOnPage] = useState('')
  const all = useMemo(() => (pages ? readyMadeFields(pages, page) : null), [pages, page])
  const rows = useMemo(() => (pages ? readyMadeFields(pages, page, onPage || undefined) : null), [pages, page, onPage])
  const menu = useMemo(() => (pages ? pageMenu(pages) : []), [pages])

  if (screen.at === 'look') {
    const row = all?.find((r) => r.id === screen.id)
    if (!row) return <AdminBack back={{ label: 'Add a field', onClick: onBack }} title="Add a field" />
    return <Look key={row.id} row={row} pageName={pageName} pageLabel={pageLabel} canRequire={canRequire} onBack={onBack} onAdd={onAdd} besides={besides} />
  }

  if (screen.at === 'make') {
    return (
      <div className="flex flex-col gap-4 [&>section]:max-w-[760px]">
        <AdminBack back={{ label: 'Add a field', onClick: onBack }} title="What kind of field?" />
        <AdminBox title="Make your own">
          {MAKE_OWN_KINDS.map((k) => (
            <AdminRow key={k.type} onClick={() => onMakeOwn(k.type, screen.name ?? '')} name={k.label} line={k.like} />
          ))}
        </AdminBox>
      </div>
    )
  }

  const shown = rows?.filter((r) => matchesSearch(r, query))
  const typed = query.trim()
  const ownName = typed.charAt(0).toUpperCase() + typed.slice(1)
  return (
    <div className="flex flex-col gap-4 [&>section]:max-w-[760px]">
      <AdminBack back={{ label: pageName, onClick: onBack }} title="Add a field" />
      <div className="flex gap-2.5 max-w-[760px]">
        <div className="flex-1 min-w-0">
          <SearchBox value={query} onChange={setQuery} label="Search fields" />
        </div>
        <AdminMenu name="Which page" value={onPage} showValue options={[{ value: '', label: 'All pages' }, ...menu.map((m) => ({ value: m, label: m }))]} onChange={setOnPage} />
      </div>
      {error && <p className="m-0 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>}
      {!shown ? (
        !error && <p className="text-sm text-muted">Loading…</p>
      ) : shown.length === 0 && typed ? (
        <AdminBox>
          <p className="m-0 px-4 py-3 text-[15px] text-slate-600">No ready-made field called “{typed}”</p>
          <AdminRow onClick={() => onScreen({ at: 'make', name: ownName })} name={`Make your own: ${ownName}`} />
        </AdminBox>
      ) : (
        shown.length > 0 && (
          <AdminBox>
            {/* Scrolls in its box, so Make your own stays in sight (board 7). */}
            <div className="max-h-[620px] overflow-y-auto rounded-[10px]">
              {shown.map((r) => (
                <AdminRow key={r.id} onClick={() => onScreen({ at: 'look', id: r.id })} name={r.label} line={r.line} />
              ))}
            </div>
          </AdminBox>
        )
      )}
      {!(shown?.length === 0 && typed) && <MakeOwnLink onClick={() => onScreen({ at: 'make' })}>Make your own field</MakeOwnLink>}
    </div>
  )
}

/** A field before adding it (canvas row "Each kind of field", Nov 7): what
 *  it is, what a page can change, each at the setting it would come with,
 *  and Add, with the page beside showing it there. What's changed here
 *  comes with it. Without room beside (a phone), board 11's samples. */
function Look({
  row,
  pageName,
  pageLabel,
  canRequire,
  onBack,
  onAdd,
  besides,
}: {
  row: ReadyField
  pageName: string
  pageLabel: string
  canRequire: boolean
  onBack: () => void
  onAdd: (row: ReadyField) => void
  besides?: (field: CategoryField) => React.ReactNode
}) {
  const [patch, setPatch] = useState<Partial<CategoryField>>({})
  const field = row.field ? { ...row.field, ...patch } : null
  const shown = field ?? basicField(row.basic!)
  // What comes with it is on as its page has it; turned on here, it's made.
  const rule = field ? partnerRule(field) : undefined
  const [partnerOn, setPartnerOn] = useState(!!row.partner)
  const partner = rule && field ? (partnerOn ? (row.partner ?? rule.make(field)) : null) : row.partner
  return (
    <div className="flex gap-6 items-start">
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <AdminBack back={{ label: 'Add a field', onClick: onBack }} title={<FieldTitle field={shown} />} />
        <WhatThisIs field={shown} partnerOn={!!partner} />
        <FieldChanges
          field={shown}
          canRequire={canRequire}
          fixed={!field}
          onChange={(p) => setPatch((was) => ({ ...was, ...p }))}
          partner={rule ? { on: partnerOn, onChange: setPartnerOn } : undefined}
        />
        {field && !besides && <Samples field={field} pageName={pageName} pageLabel={pageLabel} />}
        <button
          type="button"
          onClick={() => onAdd(field ? { ...row, field, partner } : row)}
          className="self-start min-h-12 px-[22px] rounded-[10px] bg-primary text-white text-[15px] font-bold hover:bg-primary/90 cursor-pointer"
        >
          Add to {pageName}
        </button>
      </div>
      {field && besides?.(field)}
    </div>
  )
}

const chip = 'rounded-full bg-slate-100 px-2.5 py-[3px] text-xs font-semibold text-slate-700'

/** Board 11: the field as a page shows it, in the list, the filter and on
 *  Add a place. */
function Samples({ field, pageName, pageLabel }: { field: CategoryField; pageName: string; pageLabel: string }) {
  const f = normalizeField(field)
  const options = (f.options ?? []).map((o) => o.label)
  const onRow = f.renderAs !== 'row' || !!f.showInHeader
  const rowShows = f.type === 'select' ? options[0] : f.type === 'boolean' ? f.label : null
  const filterChips = f.type === 'select' ? options : f.type === 'boolean' ? [f.label] : []
  return (
    <div className="flex flex-wrap gap-3 max-w-[760px]">
      {onRow && (
        <Pane title="In the list">
          <div className="flex items-center gap-2.5 rounded-[10px] border border-slate-100 p-2.5">
            <span aria-hidden="true" className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-indigo-100 text-[13px] font-bold text-indigo-800">
              {pageName.charAt(0).toUpperCase()}
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-1">
              <b className="text-sm">A {pageLabel.toLowerCase() || 'place'}</b>
              {rowShows ? <span className={`${chip} self-start`}>{rowShows}</span> : <span className="text-[13px] text-slate-600">{f.label}</span>}
            </span>
            <Chevron />
          </div>
        </Pane>
      )}
      {f.filterable && filterChips.length > 0 && (
        <Pane title="In the filter">
          <b className="text-sm">{f.label}</b>
          <div className="flex flex-wrap gap-1.5">
            {filterChips.map((c, i) => (
              <span key={c} className={i === 0 ? `${chip} !bg-primary !text-white` : chip}>
                {c}
              </span>
            ))}
          </div>
        </Pane>
      )}
      <Pane title="On Add a place">
        <b className="text-sm">{f.label}</b>
        <AddSample field={f} options={options} />
      </Pane>
    </div>
  )
}

// How a place fills it in, drawn by its kind (the user, Nov 5: hours, a
// phone and davening times were all an empty box).
const box = 'block rounded-md border border-slate-300 bg-white'
function AddSample({ field: f, options }: { field: CategoryField; options: string[] }) {
  const rows = (names: readonly string[], cell: string) => (
    <div className="flex flex-col gap-1.5 text-[13px]">
      {names.map((n) => (
        <span key={n} className="flex items-center gap-2">
          <span className="w-24 shrink-0">{n}</span>
          <span className={`${box} h-7 flex-1 px-2 leading-7 text-slate-400`}>{cell}</span>
        </span>
      ))}
    </div>
  )
  switch (f.type) {
    case 'select':
      return (
        <div className="flex flex-col gap-1.5 text-[13px]">
          {options.slice(0, 4).map((o) => (
            <span key={o} className="flex items-center gap-2">
              <span aria-hidden="true" className={`h-4 w-4 border-[1.5px] border-slate-400 ${f.multiSelect ? 'rounded-[4px]' : 'rounded-full'}`} />
              {o}
            </span>
          ))}
          {options.length > 4 && <span className="text-slate-500">and {options.length - 4} more</span>}
        </div>
      )
    case 'boolean':
      return (
        <div className="flex gap-1.5">
          <span className={chip}>No</span>
          <span className={chip}>Yes</span>
        </div>
      )
    case 'hours':
      return rows(['Sunday', 'Monday', 'Friday'], 'Opens – Closes')
    case 'minyanim':
      return rows(['Shacharis', 'Mincha', 'Maariv'], 'Time · days')
    case 'contacts':
      return rows(['Name', 'Phone'], '')
    case 'tel':
      return <span className={`${box} h-8 px-2 text-[13px] leading-8 text-slate-400`}>A phone number</span>
    case 'url':
      return (
        <>
          <span className={`${box} h-8 px-2 text-[13px] leading-8 text-slate-400`}>https://</span>
          <span className="self-start rounded-full border border-slate-300 px-3 py-1 text-[13px] font-semibold text-primary">{f.linkLabel || 'Open the link'}</span>
        </>
      )
    case 'tags':
      return (
        <div className="flex flex-wrap gap-1.5">
          {(options.length ? options.slice(0, 3) : []).map((o) => (
            <span key={o} className={chip}>
              {o}
            </span>
          ))}
          <span className={`${chip} !bg-white border border-dashed border-slate-300`}>+ Add an item</span>
        </div>
      )
    default:
      return <span aria-hidden="true" className={`${box} ${f.type === 'textarea' ? 'h-14' : 'h-8'}`} />
  }
}

function Pane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex-[1_1_100%] min-w-0 flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5">
      <h3 className="m-0 text-xs font-bold uppercase tracking-[.04em] text-slate-500">{title}</h3>
      {children}
    </section>
  )
}
