import { loadGoogleMaps } from './loadGoogleMaps'

// A data-only wrapper over Google's Places Autocomplete — no widget, no DOM.
// AddressInput used to delegate straight to `PlaceAutocompleteElement`, which
// on a narrow viewport takes over the entire screen with Google's own
// full-page picker instead of a normal inline dropdown; there's no option on
// the element to turn that off (checked the type definitions). Autocomplete
// suggestions as data, rendered in our own dropdown, is what
// BasicPlaceAutocompleteElement is for internally — this is that same API,
// one layer lower, so AddressInput can render the results itself and never
// hand control of the screen to Google.

export type AddressSuggestion = {
  prediction: google.maps.places.PlacePrediction
  mainText: string
  secondaryText: string
}

// Session tokens group a "typing episode" (first keystroke through a
// selection) for Google's billing — reusing a stale one, or omitting one
// entirely, means every keystroke bills as a separate request instead of one
// session. Module-level rather than per-component: AddressInput mounts fresh
// on every field it backs (the header popover, the listing form), and a
// session spans exactly one field's typing episode regardless of which
// field, so there's nothing gained by threading it through props — resetSession
// just needs calling at the start and end of each episode.
let sessionToken: google.maps.places.AutocompleteSessionToken | null = null

async function placesLibrary(): Promise<google.maps.PlacesLibrary> {
  await loadGoogleMaps()
  return google.maps.importLibrary('places')
}

/** Ends the current session (if any) so the next `fetchAddressSuggestions`
 *  call starts a fresh one. Call after a selection is made (the session
 *  concluded — see Google's own guidance on AutocompleteRequest.sessionToken)
 *  or when a field is abandoned without one (blurred empty, cleared). */
export function resetAutocompleteSession(): void {
  sessionToken = null
}

/** Fetches suggestions for the current input text. Returns an empty list on
 *  a blank input or any failure (network, auth, no key) — callers just show
 *  no dropdown rather than needing their own try/catch for this. */
export async function fetchAddressSuggestions(
  input: string,
  opts?: { includedPrimaryTypes?: string[] },
): Promise<AddressSuggestion[]> {
  const trimmed = input.trim()
  if (!trimmed) return []

  try {
    const { AutocompleteSessionToken, AutocompleteSuggestion } = await placesLibrary()
    if (!sessionToken) sessionToken = new AutocompleteSessionToken()

    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: trimmed,
      sessionToken,
      ...(opts?.includedPrimaryTypes?.length ? { includedPrimaryTypes: opts.includedPrimaryTypes } : {}),
    })

    return suggestions
      .map((s: google.maps.places.AutocompleteSuggestion) => s.placePrediction)
      .filter((p): p is google.maps.places.PlacePrediction => !!p)
      .map((prediction: google.maps.places.PlacePrediction) => ({
        prediction,
        mainText: prediction.mainText?.text ?? prediction.text.text,
        secondaryText: prediction.secondaryText?.text ?? '',
      }))
  } catch {
    return []
  }
}
