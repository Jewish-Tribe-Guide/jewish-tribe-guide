'use client'

import { useEffect, useRef, useState } from 'react'
import { TextInput } from './FormControls'
import { placesApiHoursToStructured, type StructuredHours } from '@/lib/hours'
import { MAPS_API_KEY, mapsAuthFailed, onMapsAuthFailure } from '@/lib/loadGoogleMaps'
import { fetchAddressSuggestions, resetAutocompleteSession, type AddressSuggestion } from '@/lib/placesAutocomplete'

/** Structured data returned when the user picks a suggestion from the autocomplete. */
export type PlaceSelectResult = {
  placeId: string
  name: string | null
  phone: string | null
  hours: StructuredHours | null
  website: string | null
  /** Google's own short editorial summary, when it has one (see the
   *  `googleDescription` field key convention — src/lib/categories.ts). */
  description: string | null
  /** Whether Google currently considers the business to be trading. Comes
   *  along free with the fetchFields call already being made, and matters
   *  early: it lets a moderator see "Google says this is temporarily closed"
   *  while deciding whether to approve, and stops a brand-new listing sitting
   *  with no status at all until the nightly sync first reaches it. */
  businessStatus: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null
}

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Called with the chosen place's coordinates (or null when the text is typed
   *  manually, so coordinates can't be trusted). Lets callers capture lat/lng
   *  client-side without a server geocode. */
  onCoords?: (coords: { lat: number; lng: number } | null) => void
  /** Called when the user picks an autocomplete suggestion, with structured
   *  place details (id, name, phone, hours) so callers can pre-fill the form. */
  onPlaceSelect?: (result: PlaceSelectResult) => void
  /** Restrict autocomplete results to specific place types, e.g.
   *  ['establishment'] to return businesses instead of bare addresses.
   *  When set, Google returns the matching business's name/hours/phone rather
   *  than just the address. Leave unset for general address inputs. */
  includedPrimaryTypes?: string[]
  /** Skip fetching suggestions and render a plain text input instead. Kept for
   *  the admin preview, which originally needed this to dodge a rendering bug
   *  in Google's own PlaceAutocompleteElement widget (its dropdown rendered
   *  oversized inside the preview's iframe). This component no longer uses
   *  that widget at all — see the note below — so that specific bug is moot,
   *  but the flag still short-circuits every network call for a caller that
   *  wants a deterministic, offline-safe field. */
  disableAutocomplete?: boolean
  /** Fill the field with the chosen place's name instead of its formatted
   *  address, when it has one (a plain address the visitor types has none).
   *  For callers where the field IS the display label shown back to the
   *  visitor — e.g. the "where should distances be measured from" picker —
   *  rather than a structured address value another field depends on
   *  (ListingForm's `address` field must stay a real address; it gets the
   *  place's name separately via onPlaceSelect). */
  preferPlaceName?: boolean
}

// Renders our own input and dropdown over Google's Autocomplete DATA API
// (fetchAddressSuggestions, in lib/placesAutocomplete.ts) rather than
// delegating to PlaceAutocompleteElement, Google's pre-built widget. That
// widget takes over the entire screen with its own full-page picker on a
// narrow viewport — there's no option to turn that off (checked the type
// definitions) — which meant typing an address on a phone handed off to a
// completely different, Google-branded UI instead of showing suggestions
// inline under the field like everywhere else in this app. This is that same
// underlying API, just rendered with our own markup, so it's a normal inline
// dropdown on every screen size.
export default function AddressInput({ value, onChange, placeholder = 'Address or location', onCoords, onPlaceSelect, includedPrimaryTypes, disableAutocomplete, preferPlaceName }: Props) {
  const [authFailed, setAuthFailed] = useState(mapsAuthFailed())
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [highlighted, setHighlighted] = useState(-1)
  const [resolving, setResolving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const liveSuggestions = !disableAutocomplete && !!MAPS_API_KEY && !authFailed

  useEffect(() => {
    if (!liveSuggestions) return
    return onMapsAuthFailure(() => setAuthFailed(true))
  }, [liveSuggestions])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // Close on any tap/click outside — same capture-phase pattern LocationControl
  // uses for its own popover, since this can render inside one.
  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    onChange(next)
    // Coordinates from any earlier selection no longer match free-typed text
    // — clear them (the server geocodes on submit instead).
    onCoords?.(null)
    setHighlighted(-1)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!liveSuggestions || !next.trim()) {
      setSuggestions([])
      setOpen(false)
      return
    }
    setOpen(true)
    debounceRef.current = setTimeout(async () => {
      const results = await fetchAddressSuggestions(next, { includedPrimaryTypes })
      setSuggestions(results)
    }, 200)
  }

  async function selectSuggestion(s: AddressSuggestion) {
    setOpen(false)
    setSuggestions([])
    setResolving(true)
    try {
      const place = s.prediction.toPlace()
      const extraFields = onPlaceSelect
        ? ['id', 'displayName', 'nationalPhoneNumber', 'regularOpeningHours', 'websiteURI', 'editorialSummary', 'businessStatus']
        : preferPlaceName
          ? ['displayName']
          : []
      await place.fetchFields({ fields: ['formattedAddress', 'location', ...extraFields] })
      // The session that started with the first keystroke concluded the
      // moment fetchFields ran — see the note in placesAutocomplete.ts.
      resetAutocompleteSession()

      // Google's Places API returns a `displayName` for plain street
      // addresses too now, not just businesses — and it can be a shorter,
      // abbreviated echo of what was typed ("232 S 15th St") rather than the
      // full address ("232 South 15th Street, Philadelphia, PA 19102, USA")
      // `formattedAddress` gives. Gating on the prediction's own `types`
      // (every business/POI result includes 'establishment' — see
      // https://developers.google.com/maps/documentation/places/web-service/place-types)
      // keeps the name-swap for an actual business/POI suggestion and never
      // lets a plain address suggestion resolve to anything shorter than its
      // full formatted address.
      const isBusiness = s.prediction.types?.includes('establishment') ?? false
      const label = (preferPlaceName && isBusiness && place.displayName) || place.formattedAddress
      if (label) onChange(label)
      const loc = place.location
      if (loc) onCoords?.({ lat: loc.lat(), lng: loc.lng() })

      if (onPlaceSelect && place.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = place as any
        const periods = p.regularOpeningHours?.periods ?? null
        onPlaceSelect({
          placeId: place.id,
          name: p.displayName ?? null,
          phone: p.nationalPhoneNumber ?? null,
          hours: periods ? placesApiHoursToStructured(periods) : null,
          website: p.websiteURI ?? null,
          description: typeof p.editorialSummary === 'string' ? p.editorialSummary : null,
          // Places (new) spells these OPERATIONAL / CLOSED_TEMPORARILY /
          // CLOSED_PERMANENTLY, same as the server-side Details call the sync
          // makes — anything else is treated as "not stated" rather than
          // guessed at.
          businessStatus:
            p.businessStatus === 'OPERATIONAL' ||
            p.businessStatus === 'CLOSED_TEMPORARILY' ||
            p.businessStatus === 'CLOSED_PERMANENTLY'
              ? p.businessStatus
              : null,
        })
      }
    } finally {
      setResolving(false)
    }
  }

  // Mirrors handleChange's side effects for an empty value rather than just
  // blanking the field — otherwise a stale coordinate/suggestion from
  // whatever was typed or picked before would survive the clear.
  function handleClear() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    onChange('')
    onCoords?.(null)
    setSuggestions([])
    setHighlighted(-1)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      if (highlighted >= 0) {
        e.preventDefault()
        selectSuggestion(suggestions[highlighted])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <TextInput
        type="text"
        autoComplete="off"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={resolving ? 'Loading…' : placeholder}
        disabled={resolving}
        className={value && !resolving ? 'pr-9' : undefined}
      />

      {value && !resolving && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear"
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {open && suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={s.prediction.placeId}
              type="button"
              // Prevents the input's blur (which would close this dropdown
              // before the click lands) from firing at all.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(s)}
              className={`block w-full px-3 py-2 text-left text-sm ${
                i === highlighted ? 'bg-slate-100' : 'hover:bg-slate-50'
              }`}
            >
              <span className="block text-slate-900">{s.mainText}</span>
              {s.secondaryText && <span className="block text-xs text-slate-400">{s.secondaryText}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
