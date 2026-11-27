'use client'

import { useId, useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import AddressInput, { SuggestionTag, type PlaceSelectResult } from '@/components/intake/AddressInput'
import { MessageIcon, PencilIcon } from '@/components/icons'

// "Find the place" (agreed Oct 5), since Nov 27 Add's first screen (board
// R3b): every Add opens here, the AI box a row under the list. One search for adding and editing
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
  onPaste,
}: {
  /** The guide's listings, to find and mark; null while they load. */
  listings: DirectoryResource[] | null
  /** Already searched for: the name the message reader found, or what a
   *  search that found nothing was for. */
  initialQuery?: string
  onListing: (listing: DirectoryResource) => void
  onPlace: (place: PlaceSelectResult, address: string, coords: { lat: number; lng: number } | null) => void
  /** Filling it in by hand, with what was typed. */
  onBlank: (typed: string) => void
  /** The AI box, a row under the list (board R3b): Add's first screen. */
  onPaste?: () => void
}) {
  const id = useId()
  const [typed, setTyped] = useState(initialQuery)
  // A pick reports its address and map point just before the place itself.
  const picked = useRef<{ address: string; coords: { lat: number; lng: number } | null }>({ address: '', coords: null })
  const byPlace = new Map((listings ?? []).filter((l) => typeof l.placeId === 'string' && l.placeId).map((l) => [l.placeId as string, l]))
  const matches = guideMatches(listings ?? [], typed)
  // One list (Nov 27, board R3b): the guide's places first, then Google's,
  // a Google place the guide has once, as ours, then filling it in.
  const listed = new Set(matches.map((l) => l.id))
  const name = typed.trim()
  const row = 'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50'

  return (
    <div className="space-y-3" data-testid="find-place">
      <div>
        <label htmlFor={id} className="mb-1 block text-[0.875rem] font-semibold text-slate-800">
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
          suggestionNote={(placeId) => (byPlace.has(placeId) ? 'In the guide' : null)}
          hideSuggestion={(placeId) => listed.has(byPlace.get(placeId)?.id ?? '')}
          inlineSuggestions
          searchOnMount
          listBefore={
            matches.length > 0 &&
            matches.map((l) => (
              <button key={l.id} type="button" onClick={() => onListing(l)} className={row} data-testid="in-guide">
                <span className="min-w-0 flex-1">
                  <span className="block text-slate-900">{l.name}</span>
                  <span className="block text-xs text-slate-400">{l.address ? l.address.split(',')[0] : 'No address'}</span>
                </span>
                <SuggestionTag>In the guide</SuggestionTag>
              </button>
            ))
          }
          // Only once something is typed (the user, Nov 27): filling it in
          // comes after the guide and Google have been searched for it, so
          // nobody adds a place we have without seeing it first.
          listAfter={
            name && (
              <button type="button" onClick={() => onBlank(name)} className={`${row} font-semibold text-primary`}>
                <PencilIcon className="h-4 w-4 shrink-0" />
                <span>Fill in “{name}” yourself</span>
                <span className="text-xs font-normal text-slate-500">not on Google</span>
              </button>
            )
          }
        />
      </div>
      {onPaste && (
        <button
          type="button"
          onClick={onPaste}
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
            <MessageIcon className="h-[18px] w-[18px]" />
          </span>
          <span>
            <span className="block text-[0.9375rem] font-bold text-slate-900">Or paste a post or a photo</span>
            <span className="block text-[0.8125rem] text-slate-600">An admin checks it</span>
          </span>
        </button>
      )}
    </div>
  )
}
