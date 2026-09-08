// A small badge overlaid on a category avatar's shoulder to show a listing
// is on the visitor's personal pinned shortlist — same blue circle, white
// border and 📌 glyph the map's own pin marker draws for a pinned place (see
// ResourceMap.tsx's buildPin) and NearbyList's own right-side category badge
// already reuses, so "pinned" reads the same way everywhere it shows up.
// Caller wraps the avatar in a `relative` element and renders this alongside
// it, conditionally on `isPinned(item.id)`.
export default function PinnedBadge() {
  return (
    <span
      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white text-[9px] leading-none text-white"
      style={{ backgroundColor: '#2563eb' }}
      aria-hidden="true"
    >
      📌
    </span>
  )
}
