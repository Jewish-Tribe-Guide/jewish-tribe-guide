'use client'

import Image from 'next/image'
import Link from 'next/link'
import { isOptimizableImage } from '@/lib/imageHosts'
import { useIsDesktop } from '@/lib/useIsMobile'
import type { MapCardPhoto } from '@/lib/siteSettings'
import { HOME_CARD_OUTLINE, LIFT_ON_HOVER } from './AnswerCard'

// ── "Everything on one map" — the computer home's map card (boards G3, then
// G5b, the user, Nov 11). The words and a button on the left over a picture
// that fills the card, and the whole card is the one link to the map:
// nothing inside it moves.
//
// The photo is the admin's (Site tab, "Map card photo"), deliberately a
// real picture and not a drawing of a map: the drawn one in board G "looks
// very fake" (the user), and a live map here would load the map library on
// every home visit for a card that only links. With no photo set, the left
// side is the plain map glyph on tinted ground, never a made-up map.
//
// A picture whose licence asks for a credit (the OpenStreetMap street map,
// G5c follow-up, the user's pick Nov 11) shows it small in the corner.
//
// The line under the heading names the community's own biggest categories,
// so it reads right in every community with no one-category copy.

type Props = {
  href: string
  photo: MapCardPhoto | null
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
  // Board G5b (Nov 11): the map is the page's one big stop, so the card is
  // tall (540px) and the picture fills it, fading to white under the words
  // on the left. With no picture, plain tinted ground and the map glyph.
  //
  // The picture waits until the screen is measured as a computer's: a
  // phone's first render is the computer layout, and the card in it was
  // enough to start the picture's download on phones that never show it.
  const desktop = useIsDesktop()
  return (
    <Link
      href={href}
      onClick={onOpen}
      data-testid="home-map-card"
      className={`relative flex h-[540px] overflow-hidden rounded-[18px] bg-primary/[0.06] ${HOME_CARD_OUTLINE} ${LIFT_ON_HOVER}`}
    >
      <div data-testid="home-map-card-picture" aria-hidden={photo ? undefined : true} className="absolute inset-0">
        {photo ? (
          desktop && (
          <>
            <Image
              src={photo.url}
              alt={photo.alt}
              fill
              sizes="(min-width: 1200px) 1120px, 100vw"
              className="object-cover"
              unoptimized={!isOptimizableImage(photo.url)}
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(248,250,252,0.97)_0%,rgba(248,250,252,0.9)_36%,rgba(248,250,252,0.25)_56%,rgba(248,250,252,0)_66%)]" />
          </>
          )
        ) : (
          <span className="absolute inset-y-0 right-[12%] flex items-center text-primary/40">
            <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
              <path d="M9 4v14M15 6v14" />
            </svg>
          </span>
        )}
        {desktop && photo?.credit && (
          <span data-testid="home-map-card-credit" className="absolute bottom-2.5 right-3.5 rounded bg-white/80 px-1.5 py-0.5 text-[11px] text-slate-600">
            {photo.credit}
          </span>
        )}
      </div>
      <div className="relative flex w-[440px] flex-col justify-center gap-3.5 pl-14">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-600">One map</p>
        <h2 className="text-[46px] font-extrabold leading-[1.05] text-ink">Everything on one map</h2>
        <p className="text-lg text-slate-700">{mapCardLine(categoryNames)}</p>
        <span className="mt-2 inline-flex h-[52px] w-fit items-center gap-2 rounded-full bg-primary px-[26px] text-[17px] font-bold text-white transition-colors">
          Open the map
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  )
}
