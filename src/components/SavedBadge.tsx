import { BookmarkIcon } from '@/components/icons'

// A small badge on a place's picture's shoulder: it's one of the visitor's
// saved places (Save, saved on this phone). The same blue circle and white
// bookmark the map draws on a saved place's marker (ResourceMap's buildPin),
// so "saved" reads the same everywhere. Saved places keep their place in a
// list (no floating to the top); this is how they stand out.
// Caller wraps the picture in a `relative` element and renders this beside
// it, when `isPinned(item.id)`.
export default function SavedBadge() {
  return (
    <span
      className="absolute -right-1 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white text-white"
      style={{ backgroundColor: '#2563eb' }}
      aria-hidden="true"
      data-testid="saved-badge"
    >
      <BookmarkIcon filled className="h-2.5 w-2.5" />
    </span>
  )
}
