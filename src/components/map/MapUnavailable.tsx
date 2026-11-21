/** What a visitor sees in the map's place when it can't load: no key,
 *  Google refusing it, or its code throwing (MapBoundary). The list beside
 *  or under the map has every place on it, so that's what it says; a note
 *  about keys is for whoever runs the site (Nov 18). */
export default function MapUnavailable() {
  return (
    <div role="status" className="flex h-full min-h-0 w-full flex-1 items-center justify-center rounded-2xl bg-slate-100 px-8 text-center text-[0.875rem] text-slate-600">
      The map couldn’t load. Everything on it is in the list.
    </div>
  )
}
