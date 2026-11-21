import { Fragment, type ComponentProps, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { SwipeRowGroup } from '@/components/SwipeRow'
import { pointerHover } from '@/lib/pointerHover'
import { NextMinyans } from './nextMinyans'
import { ListingOnwardContext, type ListingOnwardSource } from './listingOnward'
import { GenericListingCard } from './GenericListingCard'
import type { createHighlight } from './CategoryMap'
import type { useRowScroller } from './useRowScroller'
import type { useListingCards } from './useListingCards'

type CardProps = ComponentProps<typeof GenericListingCard>

// A category page's list of places, a section per group (moved out of
// GenericDirectory whole).
export default function DirectoryList({
  hasMinyanim,
  items,
  onwardSource,
  sections,
  closed,
  flat,
  setItemRowRef,
  mapBeside,
  highlight,
  flashId,
  setCardRef,
  isMobile,
  pagedItemId,
  category,
  rowPlaces,
  omitKey,
  flagUnconfirmed,
  upvotes,
  byPopular,
  liveCount,
  rowLook,
  candlesAt,
  reopenItemId,
  foundOn,
  onRowExpanded,
  onVote,
  questionSpot,
  questionCard,
}: {
  hasMinyanim: boolean
  items: DirectoryResource[]
  onwardSource: ListingOnwardSource
  sections: { key: string; above?: ReactNode; items: DirectoryResource[]; rowsId?: string; hidden?: boolean }[]
  closed: boolean | undefined
  flat: boolean
  setItemRowRef: ReturnType<typeof useRowScroller>['setItemRowRef']
  mapBeside: boolean
  highlight: ReturnType<typeof createHighlight>
  flashId: string | null
  setCardRef: ReturnType<typeof useListingCards>['setCardRef']
  isMobile: boolean
  pagedItemId: string | null
  category: CategoryConfig
  rowPlaces: Map<string, string | null>
  omitKey: string | null
  flagUnconfirmed: boolean
  upvotes: boolean
  byPopular: boolean
  liveCount: (item: DirectoryResource) => number
  rowLook: CardProps['look']
  candlesAt: CardProps['candlesAt']
  reopenItemId: string | null | undefined
  foundOn: (item: DirectoryResource) => CardProps['found']
  onRowExpanded: (item: DirectoryResource, expanded: boolean) => void
  onVote: (item: DirectoryResource, count: number) => void
  questionSpot: { section: string; id: string } | 'end' | null
  questionCard: ReactNode
}) {
  return (
        // One column on a phone. From sm up, a grid of 420px-minimum
        // columns: one on a narrow window, two on a laptop, never three.
        // Rows are two lines now (see listingRow.ts) and read best wide;
        // three 280px columns squeezed a name and its facts line into a
        // third of the page each.
        //
        // auto-fill, not auto-fit: auto-fit collapses empty tracks and hands
        // their width to the cards that exist, so a category of two listings
        // got two page-wide cards. auto-fill keeps the empty track as space
        // at the end of the row.
        //
        // SwipeRowGroup: only one card's swipe actions stay revealed at a
        // time, the same rule the map's nearby list follows.
        // NextMinyans: each shul row's next minyan (shul categories only).
        <NextMinyans enabled={hasMinyanim} items={items}>
        <ListingOnwardContext.Provider value={onwardSource}>
        <SwipeRowGroup>
        <div className={closed ? 'space-y-2' : undefined}>
        {sections.map((section) => (
          <div key={section.key}>
          {section.above}
          <div id={section.rowsId} hidden={section.hidden} className={closed ? 'pt-2 pb-2' : undefined}>
        {/* The flat list is one white box with a line under each row; the
            last row's line tucks under the box's own border (-mb-px). */}
        <div className={flat ? 'overflow-hidden rounded-xl border border-slate-200 bg-white' : undefined} data-testid={flat ? 'flat-list' : undefined}>
        <div
          className={
            flat
              ? '-mb-px sm:grid sm:grid-cols-[repeat(auto-fill,minmax(420px,1fr))]'
              : 'space-y-2 sm:space-y-0 sm:grid sm:gap-3 sm:grid-cols-[repeat(auto-fill,minmax(420px,1fr))]'
          }
        >
          {section.items.map((item) => (
            <Fragment key={item.id}>
            <div
              ref={setItemRowRef(item.id)}
              data-testid="directory-row"
              // A row and its pin light up together (CategoryMap), on the
              // pointer moving onto it, not on scrolling past (pointerHover).
              {...(mapBeside ? pointerHover(() => highlight.set(item.id), () => highlight.set(null)) : {})}
              className={
                flat
                  ? // An outline, drawn over the row: a ring outside it would
                    // be cut off by the list's box.
                    `border-b border-slate-100 ${flashId === item.id ? 'outline-2 -outline-offset-2 outline-primary/60' : ''}`
                  : flashId === item.id
                    ? 'rounded-xl ring-2 ring-primary/60 ring-offset-2 transition-shadow'
                    : undefined
              }
            >
            <GenericListingCard
              ref={setCardRef(item.id)}
              inColumn={!isMobile || item.id === pagedItemId}
              item={item}
              category={category}
              showCategoryLabel={false}
              place={rowPlaces.get(item.id) ?? null}
              omitKey={omitKey}
              flagUnconfirmed={flagUnconfirmed}
              likes={upvotes && byPopular ? liveCount(item) : undefined}
              look={rowLook}
              candlesAt={candlesAt}
              upvotes={upvotes}
              count={liveCount(item)}
              defaultExpanded={item.id === reopenItemId}
              // Keeps ?item=<id> in the URL in sync with whichever card is
              // actually open — a reload (or a shared link) lands back on
              // the same expanded listing, same as `davening`/`day` do for
              // the Minyanim view above. `replace`, not `push`: an
              // expand/collapse is a one-off, not something that should
              // pile up browser-back history entries the way opening an
              // Add/Edit/Report form (which does use push, see
              // FindResources' openAction) reasonably does.
              // Except on a computer, opening one from the list (Oct 6): it
              // has the page now, so it's a step Back undoes. Stepping to
              // the next one replaces it, so Back doesn't walk back through
              // every listing read.
              found={foundOn(item)}
              onExpandedChange={(expanded) => onRowExpanded(item, expanded)}
              onVote={(c) => onVote(item, c)}
            />
            </div>
            {questionSpot !== 'end' && questionSpot?.section === section.key && questionSpot.id === item.id && (
              <div className={flat ? 'border-b border-slate-100 p-3 sm:col-span-full' : 'sm:col-span-full'}>{questionCard}</div>
            )}
            </Fragment>
          ))}
        </div>
        </div>
          </div>
          </div>
        ))}
        {questionSpot === 'end' && <div className="pt-2">{questionCard}</div>}
        </div>
        </SwipeRowGroup>
        </ListingOnwardContext.Provider>
        </NextMinyans>
  )
}
