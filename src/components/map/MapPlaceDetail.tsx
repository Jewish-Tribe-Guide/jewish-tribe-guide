'use client'

import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, type CategoryConfig } from '@/lib/categories'
import PlaceDetailBody from '@/components/resources/PlaceDetailBody'
import PinButton from '@/components/resources/PinButton'
import ShareButton from '@/components/resources/ShareButton'
import CategoryIcon from '@/components/CategoryIcon'
import { ChevronLeftIcon } from '@/components/icons'
import { ui } from '@/lib/uiConfig'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'

type Props = {
  item: DirectoryResource
  category: CategoryConfig
  color: string
  onBack: () => void
}

/**
 * Full place details shown inline in the mobile map's bottom sheet — the
 * Google-Maps-style alternative to navigating away to the category
 * directory. Renders the same `PlaceDetailBody` the category directory's
 * expanded listing card does (hours, tags, badges, davening times, freeform
 * fields, caveat notes), read-only (no filter callbacks — the map has no
 * such filters of its own), plus its own header and back button. Doesn't
 * show Edit/Report/upvote, which stay a tap away in the full listing.
 */
export default function MapPlaceDetail({ item, category, color, onBack }: Props) {
  const community = useCommunitySlug()

  return (
    <div className="space-y-4 pb-2">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Back to list
      </button>

      {/* ── Header: icon, name, category, pin ────────────────────────────── */}
      <div className="flex items-start gap-3">
        <CategoryIcon
          icon={category.icon}
          iconImageUrl={
            (typeof item[PHOTO_FIELD_KEY] === 'string' && (item[PHOTO_FIELD_KEY] as string).trim()
              ? (item[PHOTO_FIELD_KEY] as string)
              : category.iconImageUrl) ?? undefined
          }
          color={color}
          className="h-12 w-12 text-2xl self-start"
          sizePx={48}
        />
        {/* No top padding here — self-start above already puts the icon's own
            top edge flush with this block's, i.e. with the name's first
            line. A pt would reintroduce exactly the few-pixel gap that made
            the icon and the name look unaligned in the first place. */}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight text-slate-900">{item.name}</h2>
          <p className="text-sm text-muted">{category.label}</p>
        </div>
        {/* self-start (like the icon above) lines it up with the name's own
            line rather than the vertical center of the whole name+category
            block — the same top-alignment PinButton's sibling "I'm here"
            (SetLocationButton) gets for free further down, since its own row
            has nothing else tall enough to visibly center against. */}
        {ui.map.pins && <PinButton id={item.id} categoryId={category.id} name={item.name} className="self-start" />}
      </div>

      <ShareButton path={routes.listing(community, category.id, listingSlug(item))} title={item.name} />

      <PlaceDetailBody item={item} category={category} />
    </div>
  )
}
