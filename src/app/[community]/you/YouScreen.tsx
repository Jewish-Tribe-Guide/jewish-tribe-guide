'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SearchBox from '@/components/home/SearchBox'
import SearchLines from '@/components/home/SearchLines'
import SwipeRow, { SwipeRowGroup } from '@/components/SwipeRow'
import SaveButton from '@/components/SaveButton'
import { BookmarkIcon } from '@/components/icons'
import { PlaceIcon, TONE, WithMinyans, eruvPlaceView, davensHere, milesFrom, placeHref, placeName, usePinnedPlaces, type PinnedPlace } from '@/components/home/PinnedPlaces'
import { TONE_WORDS } from '@/lib/eruvTone'
import { useNextMinyan } from '@/components/resources/nextMinyans'
import { useActiveCommunity, useCommunityTimezone } from '@/lib/communityContext'
import { useLocation } from '@/lib/locationContext'
import { useIsMobile } from '@/lib/useIsMobile'
import { usePinned } from '@/lib/pinnedContext'
import { useSavedSearches } from '@/lib/savedSearchesContext'
import type { SavedSearch } from '@/lib/savedSearches'
import { useChangeLog } from '@/lib/changesContext'
import { whatChanged } from '@/lib/whatChanged'
import { changedSince, loadSeenAt, storeSeenAt } from '@/lib/youChanges'
import { useHomeSearch } from '@/lib/useHomeSearch'
import { landSub, savedLand, type SearchLine } from '@/lib/searchLands'
import { getCategoryColor } from '@/lib/categoryColor'
import { useCategories } from '@/lib/useCategories'
import { listingRowFacts } from '@/lib/listingRow'
import { milesText, type LatLng } from '@/lib/geo'
import { TAB_BAR_CLEARANCE } from '@/lib/tabBarClearance'
import PhotoHeader from '@/components/PhotoHeader'

// ── You (Oct 14, canvas page "you") ──────────────────────────────────────────
// Saved places and saved searches, each with one live fact: a place's is its
// category row's own (open until, the next minyan, how far); a search's is
// what its home line would say now ("10 with Challah"), asked again the same
// way (useHomeSearch); a saved eruv's, whether it's up this week and when
// the guide checked. A blue dot and two words on a place that changed since
// You was last opened here. Swipe a row to remove it on a phone; on desktop,
// which has no swipe (Oct 15, as a listing row has none), click its
// bookmark. Either way with Undo; nothing reorders. Saved on this phone, no
// account.
//
// A search box under the title (Nov 16, canvas "Search on You", boards 1-4
// and 2b): the home's own lines, each with a bigger round bookmark, so a
// place or a search can be saved without leaving You. A line still opens
// what it names, as on the home.

export default function YouScreen() {
  const { community } = useActiveCommunity()
  const timezone = useCommunityTimezone()
  const { coords } = useLocation()
  const from = coords ?? community.mapCenter
  const home = useHomeSearch(coords)
  const places = usePinnedPlaces()
  const saved = useSavedSearches()
  const { toggle: togglePlace } = usePinned()
  const changeLog = useChangeLog()

  // When You was last opened here, read once as the page opens; then now is
  // written as the new last look, so the dots are this visit's only.
  // Undefined until then (the server's render has no device).
  const [since, setSince] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-off read of the device's storage after mount, as usePersistedState does
    setSince(loadSeenAt())
    storeSeenAt(Date.now())
  }, [])
  const changes = useMemo(() => (changeLog ? whatChanged(changeLog, timezone) : null), [changeLog, timezone])
  const dots = changedSince(changes, new Set((places ?? []).map((p) => p.id)), since ?? null)

  const searches = [...(saved?.searches ?? [])].reverse()
  const now = home.schedule?.now ?? null

  // A saved search's fact and address, as its home line says them now. A
  // kind of place's says which ("Grocery · 10 with Challah"): the same words
  // can be saved in two.
  const searchRow = (s: SavedSearch): { sub: string; href: string } => {
    if (!home.schedule || !home.listings || !home.categories) return { sub: '', href: s.href }
    const category = home.categories.find((c) => c.id === s.categoryId)
    const where = (sub: string) => (s.kind === 'category' && category ? `${category.pluralLabel} · ${sub}` : sub)
    if (s.kind === 'category' && s.filtered && category) {
      return { sub: where(landSub(savedLand(home.listings, home.categories, category, s.href, { ...home.options, slug: community.slug }))), href: s.href }
    }
    const { result, answer } = home.ask(s.words)
    const key = s.kind === 'category' ? `category:${s.categoryId}` : s.kind
    const line = home.linesFor(s.words, result, answer).find((l) => l.key === key)
    if (line) return { sub: where(line.sub), href: line.href ?? s.href }
    return { sub: s.kind === 'category' ? where('none right now') : '', href: s.href }
  }

  const empty = places !== null && places.length === 0 && searches.length === 0

  // The search: the home's lines for what's typed (useHomeSearch). Enter
  // goes where the first line does.
  const router = useRouter()
  const [query, setQuery] = useState('')
  const q = query.trim()
  const asked = q && home.listings && home.schedule ? home.ask(q) : null
  const lines = asked ? home.linesFor(q, asked.result, asked.answer) : []
  const goTo = (line: SearchLine) => {
    if (line.href) router.push(line.href)
    else if (line.kind === 'add') document.dispatchEvent(new CustomEvent('jpc:open-add'))
  }
  const hasSaves = !!places && (places.length > 0 || searches.length > 0)

  // On the photo (board W11): what's kept here, "5 places · 1 search".
  const counted = (n: number, one: string, many: string) => (n > 0 ? [`${n} ${n === 1 ? one : many}`] : [])
  const eyebrow = places === null ? null : [...counted(places.length, 'place', 'places'), ...counted(searches.length, 'search', 'searches')].join(' · ') || null

  return (
    <main
      data-testid="you-page"
      className={`mx-auto w-full max-w-6xl flex-1 px-4 ${TAB_BAR_CLEARANCE} pt-5 sm:px-6 desktop:pb-12 desktop:pt-8 animate-[fadeIn_180ms_ease-out]`}
    >
      {/* Board W11 (the user, Nov 15): a computer's top is the category
          pages' photo with the title on it; a phone keeps its own title. */}
      <PhotoHeader eyebrow={eyebrow} title="You" searchOnPhoto>
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink desktop:hidden">You</h1>

        <div data-testid="you-search" className="mt-4 desktop:mt-0 desktop:mb-9 desktop:max-w-[520px]">
          <SearchBox
            look="box"
            onPhoto
            label="Find a place or a search to save"
            placeholder={hasSaves ? 'Find more to save' : 'Find a place or a search to save'}
            query={query}
            onQueryChange={setQuery}
            onSubmit={() => lines[0] && goTo(lines[0])}
          />
          {lines.length > 0 && <SearchLines lines={lines} categories={home.categories} typed={q} onPick={goTo} roundSave className="mt-2" />}
          {asked && lines.length === 0 && (
            <p data-testid="you-search-nothing" className="mt-2 px-1 text-[14px] text-slate-500 desktop:text-white">
              Nothing in the guide for “{q}”
            </p>
          )}
        </div>

        {empty ? (
          <div data-testid="you-empty">
            <div className="mt-16 flex flex-col items-center text-center desktop:hidden">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BookmarkIcon className="h-6 w-6" />
              </span>
              <p className="mt-4 text-[19px] font-extrabold text-ink">Nothing saved yet</p>
              <p className="mt-1 text-[15px] text-slate-500">{SAVE_HOW}</p>
            </div>
            {/* A computer: where the cards will go, drawn as dashed outlines,
                the first saying how. */}
            <div aria-hidden="true" data-testid="you-empty-cards" className="hidden grid-cols-3 gap-5 desktop:grid">
              <div className={EMPTY_CARD}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <BookmarkIcon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-[17px] font-extrabold text-ink">Nothing saved yet</span>
                  <span className="block text-[14px] text-slate-500">{SAVE_HOW.replace(/\.$/, '')}</span>
                </span>
              </div>
              <div className={EMPTY_CARD} />
              <div className={EMPTY_CARD} />
            </div>
          </div>
        ) : (
          places !== null && (
            <>
              <SwipeRowGroup>
                <div className="mt-6 desktop:mt-0">
                  {places.length > 0 && (
                    <Section title="Places" testId="you-places">
                      <WithMinyans places={places}>
                        {places.map((p) => (
                          <PlaceRow
                            key={p.id}
                            place={p}
                            communitySlug={community.slug}
                            from={from}
                            now={now}
                            changed={dots.get(p.id) ?? null}
                            onRemove={() => togglePlace({ id: p.id, categoryId: p.category.id })}
                          />
                        ))}
                      </WithMinyans>
                    </Section>
                  )}
                  {searches.length > 0 && saved && (
                    <Section title="Searches" testId="you-searches" className={places.length > 0 ? 'mt-6 desktop:mt-9' : ''}>
                      {searches.map((s) => (
                        <SearchRow key={s.key} search={s} {...searchRow(s)} onRemove={() => saved.toggle(s)} />
                      ))}
                    </Section>
                  )}
                </div>
              </SwipeRowGroup>
              <p className="mt-3 text-[13px] text-slate-500 desktop:mt-9">
                <span className="desktop:hidden">Saved on this phone</span>
                <span className="hidden desktop:inline">Saved in this browser</span>
              </p>
            </>
          )
        )}
      </PhotoHeader>
    </main>
  )
}

/** How to save, said the same on a phone and a computer (board W11). */
const SAVE_HOW = 'Tap the bookmark on any place or search.'
const EMPTY_CARD = 'flex h-24 items-center gap-4 rounded-2xl border-2 border-dashed border-slate-300 px-5'

/** A phone: one white box, a row each. A computer (board W11): a card
 *  each, three across. */
const ROW = 'group border-t border-slate-100 first:border-t-0 desktop:overflow-hidden desktop:rounded-2xl desktop:border desktop:border-slate-200 desktop:bg-white desktop:first:border-t desktop:hover:shadow-md'
const ROW_LINK = 'flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 desktop:px-5 desktop:py-5'

function Section({ title, testId, className = '', children }: { title: string; testId: string; className?: string; children: React.ReactNode }) {
  return (
    <section data-testid={testId} className={className}>
      <h2 className="mb-2 text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-slate-500 desktop:mb-3">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white desktop:grid desktop:grid-cols-3 desktop:gap-4 desktop:overflow-visible desktop:rounded-none desktop:border-0 desktop:bg-transparent">{children}</div>
    </section>
  )
}

/** Desktop's way to remove a row, since a mouse can't swipe: the same
 *  bookmark a listing and a search box have (SaveButton), filled, always
 *  there at the end — not one that appears on hover, which flashed past
 *  every row the mouse crossed (Oct 15). A click takes it off, with Undo.
 *  No chevron: the row reads as a link. */
function RowBookmark({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span data-testid="you-row-bookmark" className="mr-3 hidden shrink-0 desktop:flex">
      <SaveButton saved onToggle={onRemove} name={name} />
    </span>
  )
}

function PlaceRow({
  place,
  communitySlug,
  from,
  now,
  changed,
  onRemove,
}: {
  place: PinnedPlace
  communitySlug: string
  from: LatLng
  now: number | null
  /** "New hours", when it changed since the last look. */
  changed: string | null
  onRemove: () => void
}) {
  const { category } = place
  const name = placeName(place)
  const categories = useCategories()
  const shul = useNextMinyan(place.id)
  const isMobile = useIsMobile()
  // The category row's own facts, the first that says what it's doing now
  // (open until, the next minyan) first: one line. An eruv's: whether it's
  // up, and when the guide checked.
  const eruv = place.kind === 'eruv' ? eruvPlaceView(place, now) : null
  const status: { text: string; className: string }[] =
    place.kind === 'eruv'
      ? eruv
        ? [{ text: eruv.label, className: `font-semibold ${TONE_WORDS[eruv.tone]}` }, ...(eruv.checked ? [{ text: eruv.checked.split(' · ')[0], className: '' }] : [])]
        : []
      : davensHere(category, place.item)
        ? shul
          ? [{ text: shul.text, className: TONE[shul.tone] }]
          : []
        : listingRowFacts(place.item, category, now === null ? null : new Date(now), { shul })
            .filter((f) => !f.ownLine && ['open', 'caution', 'closed', 'opens'].includes(f.tone))
            .slice(0, 1)
            .map((f) => ({ text: f.text, className: TONE[f.tone] }))
  const miles = place.kind === 'eruv' || category.hasAddress === false ? null : milesFrom(from, place.item)
  return (
    <div className={ROW}>
      <SwipeRow
        rowId={`place:${place.id}`}
        // A phone's swipe only: desktop removes with the bookmark.
        enabled={isMobile}
        actions={[{ id: 'remove', label: 'Remove', ariaLabel: `Remove ${name}`, active: false, onSelect: onRemove }]}
        className="bg-white"
        contentClassName="relative flex items-center bg-white touch-pan-y desktop:group-hover:bg-slate-50"
      >
        <Link href={placeHref(communitySlug, place)} prefetch={false} className={ROW_LINK}>
          <PlaceIcon place={place} color={getCategoryColor(categories, category.id)} className="h-11 w-11 text-lg desktop:h-14 desktop:w-14" sizePx={56} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[15.5px] font-bold text-ink">{name}</span>
              {changed && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-primary" data-testid="you-changed-dot" />}
            </span>
            <span className="mt-0.5 block truncate text-[13.5px] text-slate-600">
              {[
                ...(changed ? [<span key="changed" className="font-semibold text-primary">{changed}</span>] : []),
                ...status.map((f, i) => (
                  <span key={`s${i}`} className={f.className} data-tone={i === 0 ? eruv?.tone : undefined}>
                    {f.text}
                  </span>
                )),
                ...(miles != null ? [<span key="miles">{milesText(miles)}</span>] : []),
              ].flatMap((node, i) => (i === 0 ? [node] : [<span key={`dot${i}`}> · </span>, node]))}
            </span>
          </span>
        </Link>
        <RowBookmark name={name} onRemove={onRemove} />
      </SwipeRow>
    </div>
  )
}

function SearchRow({ search, sub, href, onRemove }: { search: SavedSearch; sub: string; href: string; onRemove: () => void }) {
  const name = `“${search.words}”`
  const isMobile = useIsMobile()
  return (
    <div className={ROW}>
      <SwipeRow
        rowId={`search:${search.key}`}
        enabled={isMobile}
        actions={[{ id: 'remove', label: 'Remove', ariaLabel: `Remove ${name}`, active: false, onSelect: onRemove }]}
        className="bg-white"
        contentClassName="relative flex items-center bg-white touch-pan-y desktop:group-hover:bg-slate-50"
      >
        <Link href={href} prefetch={false} className={ROW_LINK}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary desktop:h-14 desktop:w-14">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-5 w-5">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15.5px] font-bold text-ink">{name}</span>
            {sub && <span className="mt-0.5 block truncate text-[13.5px] text-slate-500">{sub}</span>}
          </span>
        </Link>
        <RowBookmark name={name} onRemove={onRemove} />
      </SwipeRow>
    </div>
  )
}
