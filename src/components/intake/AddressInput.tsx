'use client'

import { useEffect, useRef, useState } from 'react'
import { TextInput } from './FormControls'
import { placesApiHoursToStructured, type StructuredHours } from '@/lib/hours'

/** Structured data returned when the user picks a suggestion from the autocomplete. */
export type PlaceSelectResult = {
  placeId: string
  name: string | null
  phone: string | null
  hours: StructuredHours | null
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
}

declare global {
  interface Window {
    gm_authFailure?: () => void
  }
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

// Set to true if Google rejects the key (invalid key, Places API/billing not
// enabled, referrer not allowed). When that happens we degrade to plain text
// instead of leaving a broken Google widget on the field.
let mapsAuthFailed = false

// Load the Maps JS API once for the whole app, then resolve only when
// `google.maps.importLibrary` is actually available. With `loading=async`,
// that function is attached shortly *after* the script's load event fires, so
// resolving on `onload` alone would call importLibrary too early.
let mapsScriptPromise: Promise<void> | null = null
function loadMapsScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (mapsScriptPromise) return mapsScriptPromise

  mapsScriptPromise = new Promise<void>((resolve, reject) => {
    if (!document.getElementById('google-maps-script') && !window.google?.maps) {
      const script = document.createElement('script')
      script.id = 'google-maps-script'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places&loading=async`
      script.async = true
      script.onerror = () => reject(new Error('Failed to load Google Maps script'))
      document.head.appendChild(script)
    }

    // Poll for the modern loader to become ready (up to ~10s).
    let tries = 0
    const check = () => {
      if (typeof window.google?.maps?.importLibrary === 'function') {
        resolve()
      } else if (++tries > 200) {
        reject(new Error('Google Maps importLibrary did not become available'))
      } else {
        setTimeout(check, 50)
      }
    }
    check()
  })
  return mapsScriptPromise
}

export default function AddressInput({ value, onChange, placeholder = 'Address or location', onCoords, onPlaceSelect, includedPrimaryTypes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const elementRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null)
  const [authFailed, setAuthFailed] = useState(mapsAuthFailed)

  // Keep the latest props reachable from the long-lived effect without
  // re-running it (which would tear down and rebuild the Google element).
  const onChangeRef = useRef(onChange)
  const onCoordsRef = useRef(onCoords)
  const onPlaceSelectRef = useRef(onPlaceSelect)
  const valueRef = useRef(value)
  const placeholderRef = useRef(placeholder)
  // Captured at mount time — PlaceAutocompleteElement doesn't support changing
  // types after construction, and the listing form never changes this mid-session.
  const includedPrimaryTypesRef = useRef(includedPrimaryTypes)
  useEffect(() => {
    onChangeRef.current = onChange
    onCoordsRef.current = onCoords
    onPlaceSelectRef.current = onPlaceSelect
    valueRef.current = value
    placeholderRef.current = placeholder
  })

  useEffect(() => {
    if (!MAPS_API_KEY || mapsAuthFailed) return
    const container = containerRef.current
    if (!container || elementRef.current) return

    let cancelled = false

    // Google calls this global on auth failure (bad key, no billing, etc.).
    window.gm_authFailure = () => {
      mapsAuthFailed = true
      setAuthFailed(true)
    }

    loadMapsScript()
      .then(() => google.maps.importLibrary('places'))
      .then(() => {
        if (cancelled || !containerRef.current || mapsAuthFailed) return

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const opts: any = { placeholder: placeholderRef.current }
        if (includedPrimaryTypesRef.current?.length) {
          opts.includedPrimaryTypes = includedPrimaryTypesRef.current
        }
        const element = new google.maps.places.PlaceAutocompleteElement(opts)
        element.style.width = '100%'
        // The widget follows the OS color scheme by default; pin it to light so
        // it matches the form's (always-light) inputs instead of rendering dark.
        element.style.colorScheme = 'light'
        // Drop the built-in search icon and clear button so the field reads as a
        // plain text input (the inner input is styled via ::part in globals.css).
        element.noInputIcon = true
        element.noClearButton = true
        if (valueRef.current) element.value = valueRef.current

        // Capture address, coordinates, and (when onPlaceSelect is wired)
        // the place id, display name, phone, and opening hours for pre-fill.
        element.addEventListener('gmp-select', async (event) => {
          const place = event.placePrediction.toPlace()
          const extraFields = onPlaceSelectRef.current
            ? ['id', 'displayName', 'nationalPhoneNumber', 'regularOpeningHours']
            : []
          await place.fetchFields({ fields: ['formattedAddress', 'location', ...extraFields] })

          if (place.formattedAddress) onChangeRef.current(place.formattedAddress)
          const loc = place.location
          if (loc) onCoordsRef.current?.({ lat: loc.lat(), lng: loc.lng() })

          if (onPlaceSelectRef.current && place.id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = place as any
            const periods = p.regularOpeningHours?.periods ?? null
            onPlaceSelectRef.current({
              placeId: place.id,
              name: p.displayName ?? null,
              phone: p.nationalPhoneNumber ?? null,
              hours: periods ? placesApiHoursToStructured(periods) : null,
            })
          }
        })

        // Preserve free-typed text (no selection). Coordinates from any earlier
        // selection no longer match, so clear them (server will geocode instead).
        element.addEventListener('input', () => {
          onChangeRef.current(element.value)
          onCoordsRef.current?.(null)
        })

        // If Google reports a runtime error, fall back to a plain text field.
        element.addEventListener('gmp-error', () => {
          mapsAuthFailed = true
          setAuthFailed(true)
        })

        containerRef.current.appendChild(element)
        elementRef.current = element
      })
      .catch(() => {
        if (!cancelled) setAuthFailed(true)
      })

    return () => {
      cancelled = true
      elementRef.current?.remove()
      elementRef.current = null
    }
  }, [])

  // No key, or Google rejected the key — plain text input.
  if (!MAPS_API_KEY || authFailed) {
    return (
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    )
  }

  return <div ref={containerRef} className="w-full" />
}
