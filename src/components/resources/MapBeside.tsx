import type { ComponentProps, HTMLAttributes } from 'react'
import CategoryMap from './CategoryMap'

// The map beside a category's list from lg up, and the line between them
// (moved out of GenericDirectory whole).
export default function MapBeside({ handle, map }: { handle: HTMLAttributes<HTMLDivElement>; map: ComponentProps<typeof CategoryMap> }) {
  return (
    <>
      {/* The map, beside the list from lg up and staying in view while the
          list scrolls. Not rendered at all below that (CategoryMap loads
          nothing until it's wide enough). */}
      {/* The line between list and map: drag it to share the width
          differently, double-click it for half and half. */}
      <div
        {...handle}
        className="group hidden cursor-col-resize touch-none items-center justify-center outline-none lg:sticky lg:top-[4.5rem] lg:flex lg:h-[min(calc(100vh-6rem),720px)]"
      >
        <span className="h-12 w-1.5 rounded-full bg-slate-300 transition-colors group-hover:bg-slate-500 group-focus-visible:bg-primary group-focus-visible:ring-2 group-focus-visible:ring-primary/40" />
      </div>
      <div className="relative hidden lg:sticky lg:top-[4.5rem] lg:block lg:h-[min(calc(100vh-6rem),720px)]">
        <div className="h-full transition-opacity group-data-[snap=map]/split:opacity-30">
        <CategoryMap {...map} />
        </div>
        {/* While the line is dragged far enough to hide the map. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden items-center justify-center group-data-[snap=map]/split:flex">
          <span className="rounded-full bg-slate-900/85 px-4 py-2 text-[0.875rem] font-semibold text-white shadow-lg">Let go to hide the map</span>
        </div>
      </div>
    </>
  )
}
