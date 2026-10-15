'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import CategoryIcon from '@/components/CategoryIcon'
import SwipeRow, { SwipeRowGroup } from '@/components/SwipeRow'
import { BookmarkIcon } from '@/components/icons'
import { TONE, WithMinyans, hasMinyanim, milesFrom, photoOf, usePinnedPlaces, type PinnedPlace } from '@/components/home/PinnedPlaces'
import { useNextMinyan } from '@/components/resources/nextMinyans'
import { useActiveCommunity, useCommunityTimezone } from '@/lib/communityContext'
import { useLocation } from '@/lib/locationContext'
import { usePinned } from '@/lib/pinnedContext'
import { useSavedSearches } from '@/lib/savedSearchesContext'
import type { SavedSearch } from '@/lib/savedSearches'
import { useChangeLog } from '@/lib/changesContext'
import { whatChanged } from '@/lib/whatChanged'
import { changedSince, loadSeenAt, storeSeenAt } from '@/lib/youChanges'
import { useHomeSearch } from '@/lib/useHomeSearch'
import { landSub, savedLand } from '@/lib/searchLands'
import { getCategoryColor } from '@/lib/categoryColor'
import { useCategories } from '@/lib/useCategories'
import { initialsOf, listingRowFacts } from '@/lib/listingRow'
import { listingSlug } from '@/lib/listingSlug'
import { milesText, type LatLng } from '@/lib/geo'
import { routes } from '@/lib/routes'

// ── You (Oct 14, canvas page "you") ──────────────────────────────────────────
// Saved places and saved searches, each with one live fact: a place's is its
// category row's own (open until, the next minyan, how far); a search's is
// what its home line would say now ("10 with Challah"), asked again the same
// way (useHomeSearch). A blue dot and two words on a place that changed since
// You was last opened here. Swipe a row to remove it (or, on desktop, click
// its bookmark), with Undo; nothing reorders. Saved on this phone, no account.

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
  const dots = changedSince(changes, new Set((places ?? []).map((p) => p.item.id)), since ?? null)

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
  const both = !!places?.length && searches.length > 0

  return (
    <main
      data-testid="you-page"
      className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:px-6 desktop:max-w-5xl desktop:pb-12 desktop:pt-8 animate-[fadeIn_180ms_ease-out]"
    >
      <h1 className="text-[28px] font-extrabold tracking-tight text-ink desktop:text-[36px]">You</h1>

      {empty ? (
        <div className="mt-24 flex flex-col items-center text-center" data-testid="you-empty">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BookmarkIcon className="h-6 w-6" />
          </span>
          <p className="mt-4 text-[19px] font-extrabold text-ink">Nothing saved yet</p>
          <p className="mt-1 text-[15px] text-slate-500">Tap Save on a place or a search.</p>
        </div>
      ) : (
        places !== null && (
          <>
            <SwipeRowGroup>
              <div className={`mt-4 ${both ? 'desktop:grid desktop:grid-cols-2 desktop:items-start desktop:gap-8' : ''}`}>
                {places.length > 0 && (
                  <Section title="Places" testId="you-places">
                    <WithMinyans places={places}>
                      {places.map((p) => (
                        <PlaceRow
                          key={p.item.id}
                          place={p}
                          communitySlug={community.slug}
                          from={from}
                          now={now}
                          changed={dots.get(p.item.id) ?? null}
                          onRemove={() => togglePlace({ id: p.item.id, categoryId: p.category.id })}
                        />
                      ))}
                    </WithMinyans>
                  </Section>
                )}
                {searches.length > 0 && saved && (
                  <Section title="Searches" testId="you-searches" className={places.length > 0 ? 'mt-6 desktop:mt-0' : ''}>
                    {searches.map((s) => (
                      <SearchRow key={s.key} search={s} {...searchRow(s)} onRemove={() => saved.toggle(s)} />
                    ))}
                  </Section>
                )}
              </div>
            </SwipeRowGroup>
            <p className="mt-3 text-[13px] text-slate-500">
              <span className="desktop:hidden">Saved on this phone</span>
              <span className="hidden desktop:inline">Saved in this browser</span>
            </p>
          </>
        )
      )}
    </main>
  )
}

function Section({ title, testId, className = '', children }: { title: string; testId: string; className?: string; children: React.ReactNode }) {
  return (
    <section data-testid={testId} className={className}>
      <h2 className="mb-2 text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-slate-500">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{children}</div>
    </section>
  )
}

/** Desktop's way to remove a row, since a mouse can't swipe: its filled
 *  bookmark, always there at the end — not one that appears on hover, which
 *  flashed past every row the mouse crossed (Oct 15). Quieter than the
 *  bookmark's solid circle elsewhere, since every row here is saved. A
 *  click takes it off, with Undo. No chevron: the row reads as a link. */
function RowBookmark({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${name}`}
      title="Remove"
      data-testid="you-row-bookmark"
      className="mr-3 hidden h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 desktop:flex"
    >
      <BookmarkIcon filled className="h-[17px] w-[17px]" />
    </button>
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
  const { item, category } = place
  const categories = useCategories()
  const shul = useNextMinyan(item.id)
  // The category row's own facts, the first that says what it's doing now
  // (open until, the next minyan) first: one line.
  const facts = listingRowFacts(item, category, now === null ? null : new Date(now), { shul }).filter((f) => !f.ownLine)
  const status = hasMinyanim(category) ? (shul ? [{ text: shul.text, tone: shul.tone }] : []) : facts.filter((f) => ['open', 'caution', 'closed', 'opens'].includes(f.tone)).slice(0, 1)
  const miles = category.hasAddress === false ? null : milesFrom(from, item)
  return (
    <div className="group border-t border-slate-100 first:border-t-0">
      <SwipeRow
        rowId={`place:${item.id}`}
        actions={[{ id: 'remove', label: 'Remove', ariaLabel: `Remove ${item.name}`, active: false, onSelect: onRemove }]}
        className="bg-white"
        contentClassName="relative flex items-center bg-white touch-pan-y desktop:group-hover:bg-slate-50"
      >
        <Link href={routes.listing(communitySlug, category.id, listingSlug(item))} prefetch={false} className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3">
          <CategoryIcon
            icon={category.icon}
            categoryId={category.id}
            iconImageUrl={photoOf(item)}
            initials={initialsOf(item.name)}
            shape="square"
            color={getCategoryColor(categories, category.id)}
            className="h-11 w-11 text-lg"
            sizePx={44}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[15.5px] font-bold text-ink">{item.name}</span>
              {changed && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-primary" data-testid="you-changed-dot" />}
            </span>
            <span className="mt-0.5 block truncate text-[13.5px] text-slate-600">
              {[
                ...(changed ? [<span key="changed" className="font-semibold text-primary">{changed}</span>] : []),
                ...status.map((f, i) => (
                  <span key={`s${i}`} className={TONE[f.tone]}>
                    {f.text}
                  </span>
                )),
                ...(miles != null ? [<span key="miles">{milesText(miles)}</span>] : []),
              ].flatMap((node, i) => (i === 0 ? [node] : [<span key={`dot${i}`}> · </span>, node]))}
            </span>
          </span>
        </Link>
        <RowBookmark name={item.name} onRemove={onRemove} />
      </SwipeRow>
    </div>
  )
}

function SearchRow({ search, sub, href, onRemove }: { search: SavedSearch; sub: string; href: string; onRemove: () => void }) {
  const name = `“${search.words}”`
  return (
    <div className="group border-t border-slate-100 first:border-t-0">
      <SwipeRow
        rowId={`search:${search.key}`}
        actions={[{ id: 'remove', label: 'Remove', ariaLabel: `Remove ${name}`, active: false, onSelect: onRemove }]}
        className="bg-white"
        contentClassName="relative flex items-center bg-white touch-pan-y desktop:group-hover:bg-slate-50"
      >
        <Link href={href} prefetch={false} className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
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
