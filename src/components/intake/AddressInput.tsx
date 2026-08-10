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
export default function AddressInput({ value, onChange, placeholder = 'Address or location', onCoords, onPlaceSelect, includedPrimaryTypes, disableAutocomplete }: Props) {
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
        ? ['id', 'displayName', 'nationalPhoneNumber', 'regularOpeningHours', 'websiteURI']
        : []
      await place.fetchFields({ fields: ['formattedAddress', 'location', ...extraFields] })
      // The session that started with the first keystroke concluded the
      // moment fetchFields ran — see the note in placesAutocomplete.ts.
      resetAutocompleteSession()

      if (place.formattedAddress) onChange(place.formattedAddress)
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
        })
      }
    } finally {
      setResolving(false)
    }
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
      />

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
