'use client'

import Image from 'next/image'
import Link from 'next/link'
import { isOptimizableImage } from '@/lib/imageHosts'

// ── "Everything on one map" — the computer home's map card (board G3, the
// user, Nov 11). A photo on the left, the words and a button on the right,
// and the whole card is the one link to the map: nothing inside it moves.
//
// The photo is the admin's (Site tab, "Map card photo"), deliberately a
// real picture and not a drawing of a map: the drawn one in board G "looks
// very fake" (the user), and a live map here would load the map library on
// every home visit for a card that only links. With no photo set, the left
// side is the plain map glyph on tinted ground, never a made-up map.
//
// The line under the heading names the community's own biggest categories,
// so it reads right in every community with no one-category copy.

type Props = {
  href: string
  photo: { url: string; alt: string } | null
  /** Category names, most places first; the first five are named. */
  categoryNames: readonly string[]
  onOpen?: () => void
}

/** "Food, Grocery and Synagogues, together." */
export function mapCardLine(names: readonly string[]): string {
  const shown = names.slice(0, 5)
  if (shown.length === 0) return 'Every place in the guide, together.'
  if (shown.length === 1) return `${shown[0]}, all together.`
  return `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}, together.`
}

export default function MapCard({ href, photo, categoryNames, onOpen }: Props) {
  return (
    <Link
      href={href}
      onClick={onOpen}
      data-testid="home-map-card"
      className="group flex overflow-hidden rounded-[18px] bg-white ring-1 ring-slate-900/5 transition-shadow hover:shadow-md"
    >
      <div data-testid="home-map-card-picture" className="relative aspect-[26/15] w-[46%] shrink-0 bg-primary/10">
        {photo ? (
          <Image
            src={photo.url}
            alt={photo.alt}
            fill
            sizes="(min-width: 1200px) 520px, 46vw"
            className="object-cover"
            unoptimized={!isOptimizableImage(photo.url)}
          />
        ) : (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-primary">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
              <path d="M9 4v14M15 6v14" />
            </svg>
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center gap-3 px-12 py-10">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-600">One map</p>
        <h2 className="text-[38px] font-extrabold leading-[1.05] text-ink">Everything on one map</h2>
        <p className="text-[17px] text-slate-600">{mapCardLine(categoryNames)}</p>
        <span className="mt-2 inline-flex h-12 w-fit items-center gap-2 rounded-full bg-primary px-6 text-base font-bold text-white transition-colors group-hover:bg-primary-dark">
          Open the map
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  )
}
