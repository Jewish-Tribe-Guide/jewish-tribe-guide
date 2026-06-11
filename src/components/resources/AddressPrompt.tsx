// Shown under a category title when no location is set yet — the listings can't
// be sorted by distance until the visitor sets one (top-right location pill).
export default function AddressPrompt() {
  return (
    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
      <span aria-hidden="true">📍</span>
      Set your location at the top right to see how far each one is from you.
    </p>
  )
}
