import { PinIcon } from '@/components/icons'
import DistanceNote from './DistanceNote'

// What a computer's category photo says: how many places, the page's title,
// and where distances are from (moved out of GenericDirectory whole).
export default function CategoryHero({ count, title, anchorLabel, addressPrompt }: { count: number; title: string; anchorLabel?: string; addressPrompt?: boolean }) {
  return (
    <>
      <p className="text-[0.8125rem] font-bold uppercase tracking-[0.14em] text-white/85" data-testid="category-hero-count">
        {count} {count === 1 ? 'place' : 'places'}
      </p>
      {/* The page's h1 on a computer. A phone's is DirectoryHeader's
          (hidden here), whose title the site header shows. */}
      <h1 className="mt-1.5 text-[2.75rem] font-extrabold leading-[1.05]">{title}</h1>
      {anchorLabel ? (
        <p className="mt-2 flex items-center gap-1.5 text-[0.9375rem] text-white/90">
          <PinIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {anchorLabel}
        </p>
      ) : addressPrompt ? (
        <DistanceNote onPhoto className="mt-2" />
      ) : null}
    </>
  )
}
