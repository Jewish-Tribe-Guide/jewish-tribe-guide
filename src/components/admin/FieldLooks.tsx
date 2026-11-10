'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import { initialsOf } from '@/lib/listingRow'
import { neighborhoodsFor } from '@/lib/places'
import { useOptionalCommunitySlug } from '@/lib/communityContext'
import {
  addingScreen,
  answerText,
  filtersScreen,
  listingScreen,
  madeUpPlaces,
  rowLook,
  type FilterLook,
  type ListingScreen,
  type Part,
} from '@/lib/fieldLooks'
import { FilterChip, SwitchRow } from '@/components/resources/FiltersSheet'
import { DetailFieldInput } from '@/components/resources/DetailFieldInput'
import { ChoiceButtons, asButtons } from '@/components/resources/ListingEditor'
import { askPlaceholder } from '@/components/resources/CategoryAsk'
import { CertificateIcon, ExternalIcon, GlobeIcon, MailIcon, PhoneIcon, PinIcon, ShareIcon } from '@/components/icons'

// ── How it looks, beside a field (boards 33d–34c, Nov 9) ────────────────────
// The open field where a visitor meets it, on a made-up place, one tab per
// place: the list, Filters while it's in the filter, the opened listing,
// and the add form where visitors add. Each tab is a stretch of the phone
// screen, so the field is seen among what's around it ("so people get an
// idea of what the listing, add, filter, etc. would look like", the user,
// Nov 9); what's around it is faded and the field is outlined in blue. The
// filter and the add form are the site's own controls; the rows and the
// listing are drawn from the rules the site draws them by (fieldLooks.ts).
// Tabs inside a panel, like the preview's Page · A listing · Adding: not
// screens of their own, so no address.

const OUTLINE = 'rounded-md outline outline-2 outline-primary bg-blue-50'
const FADED = 'opacity-50'

type Tab = 'list' | 'filters' | 'listing' | 'adding'
const TAB_NAMES: Record<Tab, string> = { list: 'List', filters: 'Filters', listing: 'A listing', adding: 'Adding' }

export default function FieldLooks({
  category,
  field,
  placeName,
  askedWhen,
  canAdd,
  onShowOnRow,
  onWholePage,
}: {
  /** The page with the field on it (previewFocus.ts). */
  category: CategoryConfig
  field: CategoryField
  /** "A restaurant" (sampleName). */
  placeName: string
  /** The answer the field is asked after, if any (its showIf, which
   *  previewFocus takes off the page's copy): the made-up place gives it. */
  askedWhen?: CategoryField['showIf']
  /** Whether visitors add places here: no Adding otherwise. */
  canAdd: boolean
  /** The card's picker for the line it could go on (boards 20-23). */
  onShowOnRow?: (line: 'second' | 'third') => void
  onWholePage: () => void
}) {
  const community = useOptionalCommunitySlug()
  const places = madeUpPlaces(
    category,
    placeName,
    neighborhoodsFor(community)
      .slice(0, 3)
      .map((p) => p.name),
    askedWhen,
  )
  const rows = places.map((p) => ({ ...p, row: rowLook(category, field, p.item) }))
  const row = rows[0].row
  const filters = filtersScreen(category, field)
  const listing = listingScreen(category, field, places[0].item)

  const tabs: Tab[] = ['list', ...(filters.some((f) => f.mine) ? (['filters'] as const) : []), 'listing', ...(canAdd ? (['adding'] as const) : [])]
  // Opens on the first tab the field is in: a field off the row opens on
  // its listing. Put on its row or taken off ("Under the name", Nov 10), it
  // shows the List, where that's seen, rather than jumping to whichever tab
  // it's still in.
  const shows: Record<Tab, boolean> = { list: row.onRow, filters: true, listing: listing.at !== 'none', adding: true }
  const first = tabs.find((t) => shows[t]) ?? 'list'
  const [picked, setPicked] = useState<{ key: string; tab: Tab } | null>(null)
  const [seen, setSeen] = useState({ key: field.key, onRow: row.onRow, tab: null as Tab | null })
  if (seen.key !== field.key) setSeen({ key: field.key, onRow: row.onRow, tab: null })
  else if (seen.onRow !== row.onRow) {
    setSeen({ key: field.key, onRow: row.onRow, tab: 'list' })
    setPicked(null)
  }
  const start = seen.key === field.key && seen.tab ? seen.tab : first
  const tab = picked && picked.key === field.key && tabs.includes(picked.tab) ? picked.tab : start

  return (
    <aside aria-label="How it looks" className="shrink-0 sticky top-8 self-start flex w-[376px] flex-col gap-3">
      <div>
        <h2 className="m-0 text-base font-bold text-slate-900">How it looks</h2>
        <p className="m-0 text-[13px] text-slate-500">On a made-up place</p>
      </div>

      <div role="tablist" aria-label="Where" className="flex rounded-lg border border-slate-300 bg-white p-0.5">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setPicked({ key: field.key, tab: t })}
            className={`flex-1 min-h-10 rounded-md text-sm font-semibold cursor-pointer ${tab === t ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            {TAB_NAMES[t]}
          </button>
        ))}
      </div>

      <section role="tabpanel" aria-label={TAB_NAMES[tab]} className="flex flex-col gap-2">
        {tab === 'list' && !row.onRow && (
          <p className="m-0 text-sm text-slate-700">
            Not shown in the list.
            {row.canGoOn && onShowOnRow && (
              <>
                {' '}
                <button type="button" onClick={() => onShowOnRow(row.canGoOn!)} className="cursor-pointer font-bold text-primary hover:underline">
                  Show it on a row
                </button>
              </>
            )}
          </p>
        )}
        {tab === 'listing' && listing.at === 'none' && <p className="m-0 text-sm text-slate-700">Not shown on the listing.</p>}
        <Phone>
          <PageTop category={category} />
          {tab === 'list' && <ListView rows={rows} />}
          {tab === 'filters' && <FiltersView filters={filters} />}
          {tab === 'listing' && <ListingSheet listing={listing} item={places[0].item} where={places[0].where} />}
          {tab === 'adding' && <AddingSheet category={category} field={field} askedWhen={askedWhen} item={places[0].item} where={places[0].where} />}
        </Phone>
      </section>

      <button type="button" onClick={onWholePage} className="self-start cursor-pointer text-[15px] font-bold text-primary hover:underline">
        See the whole page
      </button>
    </aside>
  )
}

/** The phone's screen: a category page's height, cut off at the bottom. */
function Phone({ children }: { children: ReactNode }) {
  return <div className="relative flex h-[600px] flex-col overflow-hidden rounded-[28px] border border-slate-300 bg-white shadow-sm">{children}</div>
}

/** The category page's top, faded: header, search box, count, Filters and
 *  Sort. */
function PageTop({ category }: { category: CategoryConfig }) {
  return (
    <div aria-hidden="true" className="shrink-0">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <span className={`flex items-center gap-3 ${FADED}`}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-700">‹</span>
          <span className="text-xl font-extrabold text-ink">{category.pluralLabel}</span>
        </span>
        <span className={`flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-600 ${FADED}`}>
          <PinIcon className="h-3.5 w-3.5" />
          Set location
        </span>
      </div>
      <div className={`flex flex-col gap-3 px-4 pt-3.5 ${FADED}`}>
        <div className="flex h-12 items-center gap-2 rounded-xl border-[1.5px] border-primary bg-white px-3 text-[15px] text-slate-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-5 w-5 shrink-0 text-primary">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span className="truncate">{askPlaceholder(category)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold text-ink">3 listings</span>
          <span className="flex gap-2">
            <span className="rounded-full border border-slate-200 px-3.5 py-2 text-[14px] font-semibold text-primary">Filters</span>
            <span className="rounded-full border border-slate-200 px-3.5 py-2 text-[14px] text-slate-500">
              Sort <b className="font-semibold text-primary">Distance</b>
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

/** A dim over the page, and a sheet up from the bottom, scrolled so the
 *  field is in sight when it's further down than the phone's height. */
function Sheet({ top, children }: { top: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const sheet = ref.current
    const mine = sheet?.querySelector<HTMLElement>('[data-mine]')
    if (!sheet || !mine) return
    // Where the field ends in the sheet's content, whatever it's scrolled to.
    const end = mine.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + sheet.scrollTop
    sheet.scrollTop = Math.max(0, end + 24 - sheet.clientHeight)
  })
  return (
    <>
      <div aria-hidden="true" className="absolute inset-0 bg-slate-900/25" />
      <div
        ref={ref}
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[20px] bg-white shadow-[0_-4px_16px_rgba(19,36,58,0.12)]"
        style={{ top }}
      >
        {children}
      </div>
    </>
  )
}

const Grabber = () => <span aria-hidden="true" className="mx-auto mt-2 mb-1 block h-1 w-9 shrink-0 rounded-full bg-slate-300" />

const toneClass = (p: Part) => (p.tone === 'open' ? 'text-emerald-700' : p.tone === 'caution' ? 'text-orange-700' : p.tone === 'closed' ? 'text-red-700' : 'text-slate-500')

/** A line of parts, " · " between, the field's own outlined and the rest
 *  faded. */
function Parts({ parts, strong = false }: { parts: Part[]; strong?: boolean }) {
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className={`text-slate-400 ${FADED}`}> · </span>}
          {p.mine ? (
            <mark data-mine="" className={`${OUTLINE} px-1 ${strong ? 'font-bold' : ''} text-slate-900`}>
              {p.text}
            </mark>
          ) : (
            <span className={`${FADED} ${toneClass(p)}`}>{p.text}</span>
          )}
        </span>
      ))}
    </>
  )
}

/** The list (board 33d): three made-up rows, the field on each. */
function ListView({ rows }: { rows: { item: DirectoryResource; where: string | null; row: ReturnType<typeof rowLook> }[] }) {
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-2.5 px-4 pt-3">
        {rows.map(({ item, where, row }) => (
          <li key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
            <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-900 ${FADED}`}>
              {initialsOf(item.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[15px] ${FADED}`}>
                <b className="font-bold text-ink">{item.name}</b>
                {where && <span className="text-slate-500"> · {where}</span>}
              </span>
              {row.facts.length > 0 && (
                <span className="block truncate text-[13.5px]">
                  <Parts parts={row.facts} />
                </span>
              )}
              {row.own.map((p, i) => (
                <span key={i} className="block truncate text-[13.5px]">
                  <Parts parts={[p]} />
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <span
        aria-hidden="true"
        className={`absolute right-4 bottom-[72px] flex h-12 items-center rounded-full border border-add-edge bg-add pl-3.5 pr-[1.125rem] text-[15px] font-semibold text-ink ${FADED}`}
      >
        + Add
      </span>
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 flex h-14 items-center justify-around border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
        <span className={`text-primary ${FADED}`}>Home</span>
        <span className={FADED}>Map</span>
        <span className={FADED}>You</span>
      </div>
    </>
  )
}

/** Filters (board 33e): the sheet with the page's filters, the field's own
 *  outlined and working, the rest faded. */
function FiltersView({ filters }: { filters: ReturnType<typeof filtersScreen> }) {
  return (
    <Sheet top={190}>
      <Grabber />
      <p className="m-0 border-b border-slate-200 px-5 pt-1 pb-3 text-lg font-extrabold text-ink">Filters</p>
      <div className="flex flex-col gap-3 px-5 pt-3">
        {filters.map((f) =>
          f.mine ? (
            <div key={f.key} data-mine="" className={`${OUTLINE} p-2.5`}>
              <FilterControl look={f.look} on />
            </div>
          ) : (
            <div key={f.key} inert className={FADED}>
              <FilterControl look={f.look} on={false} />
            </div>
          ),
        )}
        <span aria-hidden="true" className={`mt-1 flex h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-white ${FADED}`}>
          Show 12 listings
        </span>
      </div>
    </Sheet>
  )
}

function FilterControl({ look, on }: { look: FilterLook; on: boolean }) {
  return look.kind === 'switch' ? <FilterSwitch label={look.label} on={on} /> : <FilterChips legend={look.legend} values={look.values} on={on} />
}

function FilterSwitch({ label, on: start }: { label: string; on: boolean }) {
  const [on, setOn] = useState(start)
  return <SwitchRow label={label} on={on} onToggle={() => setOn((o) => !o)} />
}

function FilterChips({ legend, values, on }: { legend: string; values: { text: string; count?: number }[]; on: boolean }) {
  const [chosen, setChosen] = useState<string[]>(on ? values.slice(0, 1).map((v) => v.text) : [])
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-[13px] font-bold text-slate-500">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <FilterChip
            key={v.text}
            label={v.text}
            count={v.count}
            on={chosen.includes(v.text)}
            onToggle={() => setChosen((c) => (c.includes(v.text) ? c.filter((x) => x !== v.text) : [...c, v.text]))}
          />
        ))}
      </div>
    </fieldset>
  )
}

const ACTION_ICONS: Record<ListingScreen['actions'][number]['icon'], ReactNode> = {
  call: <PhoneIcon className="h-5 w-5" />,
  website: <GlobeIcon className="h-5 w-5" />,
  certificate: <CertificateIcon className="h-5 w-5" />,
  email: <MailIcon className="h-5 w-5" />,
  link: <ExternalIcon className="h-5 w-5" />,
  share: <ShareIcon className="h-5 w-5" />,
}

/** The opened listing (boards 33f, 34c): the header, the buttons, the
 *  boxes, the field marked where it is. */
function ListingSheet({ listing, item, where }: { listing: ListingScreen; item: DirectoryResource; where: string | null }) {
  return (
    <Sheet top={120}>
      <Grabber />
      <div className="flex gap-3.5 px-5 pt-2">
        <span aria-hidden="true" className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg font-bold text-blue-900 ${FADED}`}>
          {initialsOf(item.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`m-0 text-[22px] font-extrabold leading-tight text-ink ${FADED}`}>{item.name}</p>
          <p className="m-0 mt-1 text-[14.5px]">
            <Parts parts={[...listing.kind, ...(where ? [{ text: where, mine: false }] : [])]} />
          </p>
          {listing.facts.length > 0 && (
            <p className="m-0 mt-0.5 text-[15px] font-bold">
              <Parts parts={listing.facts} strong />
            </p>
          )}
          {listing.tagline && (
            <p className="m-0 mt-0.5 text-[14.5px]">
              {listing.tagline.mine ? (
                <mark data-mine="" className={`${OUTLINE} px-1 text-slate-900`}>
                  {listing.tagline.text}
                </mark>
              ) : (
                <span className={`${FADED} text-slate-600`}>{listing.tagline.text}</span>
              )}
            </p>
          )}
        </div>
      </div>
      <div aria-hidden="true" className={`mt-4 flex justify-around px-3 ${FADED}`}>
        {listing.actions.map((a) => (
          <span key={a.label} className="flex w-16 flex-col items-center gap-1 text-primary">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">{ACTION_ICONS[a.icon]}</span>
            <span className="w-[84px] truncate text-center text-xs font-semibold">{a.label}</span>
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 px-4">
        {listing.boxes.map((b) => (
          <div key={b.title} data-mine={b.mine ? '' : undefined} className={b.mine ? `${OUTLINE} rounded-xl px-4 py-3` : 'rounded-xl border border-slate-200 px-4 py-3'}>
            <p className={`m-0 text-[15px] font-bold text-ink ${b.mine ? '' : FADED}`}>{b.title}</p>
            {b.label && <p className="m-0 mt-1 text-[13px] font-semibold text-slate-500">{b.label}</p>}
            {b.lines.map((line, i) => (
              <p key={i} className={`m-0 mt-1 truncate text-sm ${b.mine ? 'whitespace-normal text-slate-800' : `${FADED} text-slate-600`}`}>
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>
    </Sheet>
  )
}

/** Adding (board 33g): the add form, the field's row open, the field in it
 *  the add form's own control, answered with the made-up place's answer.
 *  Typing in it changes nothing anywhere. */
function AddingSheet({
  category,
  field,
  askedWhen,
  item,
  where,
}: {
  category: CategoryConfig
  field: CategoryField
  askedWhen?: CategoryField['showIf']
  item: DirectoryResource
  where: string | null
}) {
  const screen = addingScreen(category, field, item, askedWhen)
  return (
    <Sheet top={60}>
      <div aria-hidden="true" className={`flex shrink-0 items-center gap-2.5 border-b border-slate-200 px-5 py-3.5 ${FADED}`}>
        <span className="text-lg text-slate-600">‹</span>
        <span className="text-lg font-extrabold text-ink">Add to {category.pluralLabel}</span>
      </div>
      <div className="flex flex-col gap-3 px-4 pt-3">
        {screen.before.map((r, i) => (
          <div key={r.title} className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3.5 ${FADED}`}>
            <span className="flex shrink-0 items-center gap-3">
              {i === 0 && (
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-900">
                  {initialsOf(item.name)}
                </span>
              )}
              <span className="whitespace-nowrap text-[15px] font-bold text-ink">{r.title}</span>
            </span>
            <span className="min-w-0 truncate text-sm text-slate-500">{r.text || (i > 0 ? where : '') || ''}</span>
          </div>
        ))}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-300 px-3 pb-3">
          <p className={`m-0 flex items-center justify-between px-1 pt-3 text-[15px] font-bold text-ink ${FADED}`}>
            {screen.title}
            <span aria-hidden="true" className="text-slate-400">
              ⌃
            </span>
          </p>
          {screen.fields.map((f) =>
            f.key === field.key ? (
              <div key={f.key} data-mine="" className={`${OUTLINE} p-2.5`}>
                <AddInput field={f} start={item[f.key]} big={screen.big} />
              </div>
            ) : (
              <div key={f.key} inert className={FADED}>
                <AddInput field={f} start={item[f.key]} big={false} />
              </div>
            ),
          )}
          <span aria-hidden="true" className={`flex h-11 items-center justify-center rounded-full border border-slate-300 text-[15px] font-bold text-primary ${FADED}`}>
            Done
          </span>
        </div>
      </div>
    </Sheet>
  )
}

/** The add form's own input, answered as the made-up place answers it. */
function AddInput({ field, start, big }: { field: CategoryField; start: unknown; big: boolean }) {
  const [value, setValue] = useState<unknown>(start)
  // Hours, minyanim, the people to call, the items and a photo are a
  // screen of their own when adding; here, what they'd say.
  if (big || field.type === 'image') {
    return (
      <>
        <p className="m-0 text-sm font-medium text-slate-700">{field.label}</p>
        <p className="m-0 mt-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">{answerText(field, value) || 'Add a photo'}</p>
      </>
    )
  }
  return asButtons(field) ? <ChoiceButtons field={field} value={value} onChange={setValue} /> : <DetailFieldInput field={field} value={value} onChange={setValue} />
}
