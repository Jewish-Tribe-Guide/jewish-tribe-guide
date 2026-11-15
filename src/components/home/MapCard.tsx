'use client'

import Image from 'next/image'
import Link from 'next/link'
import { isOptimizableImage } from '@/lib/imageHosts'
import { useIsDesktop } from '@/lib/useIsMobile'
import type { MapCardPhoto } from '@/lib/siteSettings'

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
  // Board W7l (the user, Nov 15): a band from edge to edge, 420px tall, the
  // picture filling it and fading to white under the words, which sit in
  // the page's column. It was a 540px card (G5b); with Explore a band above
  // it, the two now weigh about the same. With no picture, plain tinted
  // ground and the map glyph. No lift: a band doesn't rise off the page;
  // the button darkens instead.
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
      // Full width as the hero is (HeroHeading).
      className="group relative left-1/2 block h-[420px] w-screen -translate-x-1/2 overflow-hidden border-y border-slate-200 bg-primary/[0.06]"
    >
      <div data-testid="home-map-card-picture" aria-hidden={photo ? undefined : true} className="absolute inset-0">
        {photo ? (
          desktop && (
          <>
            <Image
              src={photo.url}
              alt={photo.alt}
              fill
              sizes="100vw"
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
      <div className="relative mx-auto flex h-full max-w-7xl px-4 sm:px-6">
      <div className="flex w-[440px] flex-col justify-center gap-3.5">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-600">One map</p>
        <h2 className="text-[46px] font-extrabold leading-[1.05] text-ink">Everything on one map</h2>
        <p className="text-lg text-slate-700">{mapCardLine(categoryNames)}</p>
        {/* No chevron on the button (the user, Nov 11): the words are the
            action, and the whole card is the link. */}
        <span data-testid="map-card-button" className="mt-2 inline-flex h-[52px] w-fit items-center rounded-full bg-primary px-[26px] text-[17px] font-bold text-white transition-colors group-hover:bg-primary-dark">
          Open the map
        </span>
      </div>
      </div>
    </Link>
  )
}
