'use client'

import { useId, useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import AddressInput, { type PlaceSelectResult } from '@/components/intake/AddressInput'

// "Find the place" (agreed Oct 5): the "+ Add" box's way in for someone who
// would rather fill it in themselves. One search for adding and editing
// alike: the guide's own listings by name, and Google's places, the ones the
// guide already has marked "Already in the guide". A place the guide has
// opens its edit; a new one, the add form filled in from Google.

const nameKey = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** The guide's listings whose name has a word starting with each word
 *  typed: "trader j" is Trader Joe's, "joes" is too. */
export function guideMatches(listings: readonly DirectoryResource[], typed: string, max = 5): DirectoryResource[] {
  const words = nameKey(typed).split(' ').filter(Boolean)
  if (words.length === 0 || nameKey(typed).length < 2) return []
  return listings.filter((l) => {
    const name = nameKey(l.name).split(' ')
    return words.every((w) => name.some((n) => n.startsWith(w)))
  }).slice(0, max)
}

export default function FindPlace({
  listings,
  initialQuery = '',
  onListing,
  onPlace,
  onBlank,
}: {
  /** The guide's listings, to find and mark; null while they load. */
  listings: DirectoryResource[] | null
  /** Already searched for: the name the message reader found. */
  initialQuery?: string
  onListing: (listing: DirectoryResource) => void
  onPlace: (place: PlaceSelectResult, address: string, coords: { lat: number; lng: number } | null) => void
  onBlank: () => void
}) {
  const id = useId()
  const [typed, setTyped] = useState(initialQuery)
  // A pick reports its address and map point just before the place itself.
  const picked = useRef<{ address: string; coords: { lat: number; lng: number } | null }>({ address: '', coords: null })
  const byPlace = new Map((listings ?? []).filter((l) => typeof l.placeId === 'string' && l.placeId).map((l) => [l.placeId as string, l]))
  const matches = guideMatches(listings ?? [], typed)

  return (
    <div className="space-y-3" data-testid="find-place">
      <div>
        <label htmlFor={id} className="mb-1 block text-[14px] font-semibold text-slate-800">
          Name or address
        </label>
        <AddressInput
          id={id}
          autoFocus
          value={typed}
          onChange={(v) => {
            picked.current.address = v
            setTyped(v)
          }}
          onCoords={(c) => {
            picked.current.coords = c
          }}
          onPlaceSelect={(place) => {
            const inGuide = byPlace.get(place.placeId)
            if (inGuide) onListing(inGuide)
            else onPlace(place, picked.current.address, picked.current.coords)
          }}
          placeholder="Search by name or address…"
          suggestionNote={(placeId) => (byPlace.has(placeId) ? 'Already in the guide' : null)}
          inlineSuggestions
          searchOnMount
        />
      </div>
      {matches.length > 0 && (
        <div>
          <p className="text-[12px] font-bold tracking-wide text-slate-500 uppercase">In the guide</p>
          <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {matches.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => onListing(l)} className="w-full cursor-pointer px-3 py-2 text-left hover:bg-slate-50">
                  <span className="block text-[14.5px] font-semibold text-slate-900">{l.name}</span>
                  {l.address && <span className="block text-[12.5px] text-slate-500">{l.address.split(',')[0]}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-center">
        <button type="button" onClick={onBlank} className="cursor-pointer text-[13.5px] font-semibold text-primary hover:underline">
          Not on Google? Fill it in yourself
        </button>
      </p>
    </div>
  )
}
