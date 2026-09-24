'use client'

import { useRef, useState } from 'react'
import { fieldIsVisible, isCategorySyncEligible, type CategoryConfig } from '@/lib/categories'
import { formatPhone } from '@/lib/validation'
import type { DirectoryResource, ResourceSubmission } from '@/types'
import type { PlaceSelectResult } from '@/components/intake/AddressInput'

/**
 * A listing being written — every value a visitor can change, plus the
 * Google place data an address pick carries along with it — and how to turn
 * it into a submission. Shared by the two surfaces that write listings: the
 * plain form (ListingForm, for Add) and the listing-shaped editor
 * (ListingEditor, for Edit), so what a submission contains can't depend on
 * which of them produced it.
 *
 * Holds no UI and posts nothing; useListingSubmit does the sending.
 */
export function useListingDraft(category: CategoryConfig, existing?: DirectoryResource) {
  const config = category
  const hasAddress = category.hasAddress !== false
  const hasPhone = category.hasPhone !== false
  const syncEligible = isCategorySyncEligible(category)

  const [name, setName] = useState(existing?.name ?? '')
  const [address, setAddress] = useState(existing?.address ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [placeId, setPlaceId] = useState<string | null>(
    typeof existing?.placeId === 'string' ? existing.placeId : null,
  )
  const [businessStatus, setBusinessStatus] = useState<PlaceSelectResult['businessStatus']>(
    typeof existing?.businessStatus === 'string'
      ? (existing.businessStatus as PlaceSelectResult['businessStatus'])
      : null,
  )
  // What picking an address autofilled into the syncable fields, this session
  // — sent along in the submission (see buildSubmission below) so the server
  // can tell "matches what Google gave us" from "the submitter typed
  // something different" without an extra Google API call for the common
  // case where autofill did run. Populated by handlePlaceSelect; a ref
  // because nothing renders from it.
  const autofilled = useRef<{ name?: string; phone?: string; hours?: string; website?: string; description?: string }>({})
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    (existing?.geo as { lat: number; lng: number } | undefined) ?? null,
  )
  const [details, setDetails] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    for (const field of config?.detailFields ?? []) {
      if (existing && field.key in existing) init[field.key] = existing[field.key]
      // Load companion "sometimes" array for tag fields.
      if (field.type === 'tags' && existing) {
        const sk = field.key + '_sometimes'
        if (sk in existing) init[sk] = existing[sk]
      }
    }
    return init
  })

  function setDetail(key: string, value: unknown) {
    setDetails((prev) => ({ ...prev, [key]: value }))
  }

  function handlePlaceSelect(result: PlaceSelectResult) {
    if (syncEligible) setPlaceId(result.placeId)
    // Carried through so the listing is never published with no status at all.
    // The sync overwrites this on its first run either way — this just covers
    // the window between someone submitting and a moderator approving, during
    // which the queue can show that Google already reports the place closed.
    if (syncEligible) setBusinessStatus(result.businessStatus)
    // Always overwrite — if you switch from "Trader Joe's" to "Giant", all
    // auto-filled fields should update to match the new selection.
    if (result.name) setName(result.name)
    if (result.phone) setPhone(formatPhone(result.phone))
    if (result.hours) {
      const hoursField = config.detailFields.find((f) => f.type === 'hours')
      if (hoursField) setDetail(hoursField.key, result.hours)
    }
    // Matched by label, not key — existing categories' Website fields
    // predate a fixed key convention (e.g. keyed "w" or "whatsapp"), so
    // matching on the label people actually see is the reliable signal.
    const websiteField = config.detailFields.find(
      (f) => f.type === 'url' && f.label.trim().toLowerCase() === 'website',
    )
    if (result.website && websiteField) setDetail(websiteField.key, result.website)

    // Remember exactly what autofill put in the syncable fields. Whether these
    // values survive to submit is what tells the recurring Google sync which
    // fields it owns. website is only recorded when the category actually has
    // a Website field to compare against (websiteKey there mirrors this same
    // lookup).
    // Matched by key (the fixed `googleDescription` convention — see
    // src/lib/categories.ts's showInHeader doc), not label, since a category
    // names this field's display label whatever it wants ("Description",
    // "About", …). Unlike name/phone/hours above, only FILLS a gap rather
    // than always overwriting: re-picking the address on an edit shouldn't
    // risk clobbering hand-written text. Ownership is still recorded against
    // what Google actually returned regardless — a description that's
    // already present and therefore left alone is exactly the case that
    // should compare as "differs from Google" once submitted.
    const descriptionField = config.detailFields.find((f) => f.key === 'googleDescription')
    if (result.description && descriptionField && !details[descriptionField.key]) {
      setDetail(descriptionField.key, result.description)
    }

    autofilled.current = {
      name: result.name ?? undefined,
      phone: result.phone ? formatPhone(result.phone) : undefined,
      hours: result.hours ? JSON.stringify(result.hours) : undefined,
      website: result.website && websiteField ? result.website : undefined,
      description: result.description && descriptionField ? result.description : undefined,
    }
  }

  /** Only the fields actually shown right now (respects showIf, and
   *  categories that hide address/phone), each tags field with its
   *  companion "sometimes" array. */
  function visibleDetails(): Record<string, unknown> {
    const visible: Record<string, unknown> = {}
    for (const field of config.detailFields) {
      if (fieldIsVisible(field, details)) {
        visible[field.key] = details[field.key]
        if (field.type === 'tags') {
          visible[field.key + '_sometimes'] = details[field.key + '_sometimes'] ?? []
        }
      }
    }
    return visible
  }

  /** The submission body for /api/submissions (or /api/admin/listings). */
  function buildSubmission(): ResourceSubmission {
    return {
      category: category.id,
      name,
      // Listings aren't hospital-scoped; distance is computed from the geocoded
      // address. `anchorId` is just a grouping key ('community' for categories
      // with no address at all; 'all' otherwise).
      anchorId: hasAddress ? 'all' : 'community',
      distance: null,
      address: hasAddress ? address : '',
      phone: hasPhone ? phone : '',
      details: {
        ...visibleDetails(),
        // Carry the Google place id through so the sync job can pick it up as
        // soon as the listing is approved. Only set for sync-eligible categories.
        ...(syncEligible && placeId ? { placeId } : {}),
        ...(syncEligible && businessStatus ? { businessStatus } : {}),
        // What autofill put in each syncable field this session, if picking an
        // address triggered it — free evidence of "this is what Google had"
        // for whichever fields it covers. The server (submissionStore.ts's
        // resolveGoogleFields, on approval) compares the submitted value
        // against this to decide Google-ownership without an API call for the
        // common case; it only spends a live Google lookup for a
        // new/changed field that was never autofilled at all.
        ...(syncEligible ? { googleAutofill: autofilled.current } : {}),
      },
      geo: hasAddress ? coords : null,
    }
  }

  return {
    hasAddress,
    hasPhone,
    syncEligible,
    name,
    setName,
    address,
    setAddress,
    phone,
    setPhone,
    placeId,
    coords,
    setCoords,
    details,
    setDetail,
    handlePlaceSelect,
    visibleDetails,
    buildSubmission,
  }
}

export type ListingDraft = ReturnType<typeof useListingDraft>
