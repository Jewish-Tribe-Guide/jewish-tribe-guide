'use client'

import { useEffect, useRef, useState } from 'react'
import { fieldIsVisible, isCategorySyncEligible, resolveCapabilities, selectValues, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { formatPhone, normalizeUrl } from '@/lib/validation'
import { hasListingChanged } from '@/lib/listingDiff'
import type { DirectoryResource, ResourceSubmission } from '@/types'
import TagsInput from './TagsInput'
import ImageUploadField from '@/components/ImageUploadField'
import AddressInput, { type PlaceSelectResult } from '@/components/intake/AddressInput'
import HoursInput from '@/components/intake/HoursInput'
import MinyanimInput from '@/components/intake/MinyanimInput'
import UpButton from '@/components/UpButton'
import Honeypot from '@/components/Honeypot'
import TurnstileWidget, { type TurnstileHandle } from '@/components/TurnstileWidget'
import PrivacyNote from '@/components/PrivacyNote'
import RemovalRequest from './RemovalRequest'
import { ui } from '@/lib/uiConfig'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { useSetScreenHeader } from '@/lib/headerVisibility'

// Whether the Turnstile challenge is actually active for this deploy — mirrors
// TurnstileWidget's own check. When it's not configured, the widget renders
// nothing and never calls back with a token, so submission can't be gated on
// having one.
const TURNSTILE_ACTIVE = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

type Props = {
  /** The category this listing belongs to (fixed by where the form was opened). */
  category: CategoryConfig
  mode: 'create' | 'edit'
  /** Existing listing to pre-fill, when editing. */
  existing?: DirectoryResource
  onUp: () => void
  onSubmitted: () => void
  /** Admin-preview only: when set, Submit builds the resource locally and
   *  hands it to this callback instead of posting to /api/submissions — so
   *  the category editor's Preview can show it appearing in the directory
   *  without persisting anything. */
  onPreviewSubmit?: (resource: DirectoryResource) => void
  /** When provided, use this already-in-progress Turnstile challenge (owned by
   *  a parent that mounted it as soon as the category directory loaded)
   *  instead of rendering a fresh one here. The challenge takes a few seconds
   *  to resolve — starting it the moment the visitor lands on the category,
   *  rather than only once they open Add/Edit, means it's usually already
   *  solved by the time they hit Submit, instead of making them wait through
   *  "Verifying…" right when they open the form. Falls back to rendering its
   *  own widget (the old behavior) when omitted, e.g. in the admin preview. */
  sharedTurnstile?: { token: string; reset: () => void }
  /** Admin console only: adds the listing directly and live via
   *  /api/admin/listings, skipping the public form's anti-abuse layer
   *  (Turnstile, honeypot), the submitter name/email fields, and the
   *  moderation queue entirely — this path is already behind real admin
   *  auth. Only meaningful with mode="create"; see CategoryManager's
   *  "+ Add listing" action. */
  adminSubmit?: { token: string }
  /** Rendered inside a caller-owned overlay (desktop's Edit dialog) instead
   *  of as this screen's own top-level content — same reasoning, and same
   *  treatment as every embedded surface: skips the mobile
   *  header title hijack (useSetScreenHeader) and this component's own
   *  Breadcrumb/h2, since the dialog already has its own title and close
   *  control. Desktop only in practice (Edit stays a full screen on
   *  mobile), but not itself device-gated — the caller decides when to
   *  pass it. */
  embedded?: boolean
  /** Fires whenever this component swaps between its own fields and the
   *  Request removal panel — lets an embedding caller's OWN title (this
   *  component's own heading is suppressed while embedded) become "Request
   *  removal of {name}" instead of showing a second, smaller title for the
   *  same thing nested inside the form. See ListingDetailModal/
   *  MapPlaceDetail/FindResources for the callers that use it. */
  onRemovalOpenChange?: (open: boolean) => void
}

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary'

type FieldGroupBlock = {
  sectionKey: string
  label: string
  description?: string
  isAudience: boolean
  fields: CategoryField[]
}

// Every non-core, visible detail field lands in exactly one named,
// independently-collapsible group: this key for the generic catch-all,
// `section:audience:{key}` for an audience section, `section:form:{key}` for
// an admin-assigned formSection.
const MORE_DETAILS_KEY = 'section:more'

// Groups fields into blocks — see MORE_DETAILS_KEY's own doc for the three
// kinds. A group renders where its FIRST field appears (stable, not
// necessarily contiguous), except "More details" itself, which always
// renders last regardless of where its fields happen to sit in the
// category's own field order: an admin-named group (an audience section, a
// formSection) was deliberately curated as its own thing, while the
// catch-all is whatever's left over — usually exactly the fields least
// likely to matter to a visitor submitting or fixing a listing — and
// shouldn't out-rank a group someone actually organized.
function groupNonCoreFields(fields: CategoryField[], config: CategoryConfig): FieldGroupBlock[] {
  const blocks: FieldGroupBlock[] = []
  const blockAt = new Map<string, number>()
  for (const field of fields) {
    let sectionKey: string
    let label: string
    let description: string | undefined
    let isAudience = false
    if (field.audienceKey) {
      // filterLabel is the short form ("Women's") the filter chip already
      // uses; label ("Women's Tevillah") is the fallback for a boolean
      // that has no filterLabel set.
      sectionKey = `section:audience:${field.audienceKey}`
      const audienceField = config.detailFields.find((f) => f.key === field.audienceKey)
      label = audienceField?.filterLabel ?? audienceField?.label ?? field.audienceKey
      isAudience = true
    } else if (field.formSection) {
      sectionKey = `section:form:${field.formSection}`
      const def = config.formSections?.find((s) => s.key === field.formSection)
      label = def?.label ?? field.formSection
      description = def?.description
    } else {
      sectionKey = MORE_DETAILS_KEY
      label = 'More details'
    }
    const at = blockAt.get(sectionKey)
    const existingBlock = at !== undefined ? blocks[at] : undefined
    if (existingBlock) {
      existingBlock.fields.push(field)
    } else {
      blockAt.set(sectionKey, blocks.length)
      blocks.push({ sectionKey, label, description, isAudience, fields: [field] })
    }
  }

  const moreDetailsAt = blocks.findIndex((b) => b.sectionKey === MORE_DETAILS_KEY)
  if (moreDetailsAt !== -1 && moreDetailsAt !== blocks.length - 1) {
    const [moreDetailsBlock] = blocks.splice(moreDetailsAt, 1)
    blocks.push(moreDetailsBlock)
  }

  // No reordering within a block beyond that — a field's position is
  // whatever order the category itself lists it in. An earlier version of
  // this also forced the photo field to always sort last, generalized from
  // one category's own preference (Networking: photo below its Description)
  // into a rule for every category — which then fought the opposite
  // preference for another (Food: photo above its Short Description). Each
  // category's own field order is the actual source of truth; reorder the
  // category's fields (an admin-content change) if the order is wrong, not
  // this function.
  return blocks
}

export default function ListingForm({ category, mode, existing, onUp, onSubmitted, onPreviewSubmit, sharedTurnstile, adminSubmit, embedded, onRemovalOpenChange }: Props) {
  const community = useCommunitySlug()
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
  // — sent along in the submission (see the payload below) so the server can
  // tell "matches what Google gave us" from "the submitter typed something
  // different" without an extra Google API call for the common case where
  // autofill did run. Populated by handlePlaceSelect; a ref because nothing
  // renders from it.
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
  const [submitterName, setSubmitterName] = useState('')
  const [submitterEmail, setSubmitterEmail] = useState('')
  // Honeypot — stays empty for humans; bots that auto-fill it get dropped server-side.
  const [honeypot, setHoneypot] = useState('')
  const [ownTurnstileToken, setOwnTurnstileToken] = useState('')
  const ownTurnstileRef = useRef<TurnstileHandle>(null)
  const turnstileToken = sharedTurnstile ? sharedTurnstile.token : ownTurnstileToken
  const resetTurnstile = () => {
    if (sharedTurnstile) sharedTurnstile.reset()
    else {
      ownTurnstileRef.current?.reset()
      setOwnTurnstileToken('')
    }
  }

  // Whether we've already refreshed the challenge once for this form. A second
  // failure means retrying is not the answer, so stop telling the visitor it is
  // — see handleSubmit.
  const [retriedVerification, setRetriedVerification] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [done, setDone] = useState(false)
  // What was submitted, for the confirmation copy: an edit and a removal
  // request get different thank-yous.
  const [doneKind, setDoneKind] = useState<'submission' | 'removal'>('submission')

  // Whether Request removal has swapped out the edit fields for its own
  // panel — see the removalOpen block near the bottom of this component's
  // JSX for why it's a swap, not an accordion appended under the fields.
  const [removalOpen, setRemovalOpen] = useState(false)
  const canRequestRemoval =
    mode === 'edit' && !!existing && !adminSubmit && !onPreviewSubmit && ui.contributions.report && resolveCapabilities(config.capabilities).report
  // Runs on mount too (not just on change) — deliberately: an embedding
  // caller's own removalOpen mirror could otherwise start stale (true) from
  // a previous open of a DIFFERENT listing if it isn't reset at every entry
  // point, and this self-corrects it the instant a fresh ListingForm mounts.
  useEffect(() => {
    onRemovalOpenChange?.(removalOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removalOpen])

  // Explicit collapse/expand overrides, keyed per group ('basics', an
  // audience section, a formSection, or the 'More details' catch-all) —
  // absent from the map means "use the default for this group" (see
  // groupIsOpen below), not "expanded". Basics defaults open regardless of
  // content; every other group defaults open only once it already holds a
  // value (edit) and collapsed otherwise (create, or an untouched group in
  // edit) — see hasGroupValue. This is what lets a long category's edit
  // form open exactly the sections that already have something in them
  // instead of showing every field flat, while a brand-new listing starts
  // with nothing but Basics expanded.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  function groupIsOpen(key: string, defaultOpen: boolean): boolean {
    const explicit = collapsedSections[key]
    return explicit === undefined ? defaultOpen : !explicit
  }
  function toggleGroup(key: string, currentlyOpen: boolean) {
    setCollapsedSections((prev) => ({ ...prev, [key]: currentlyOpen }))
  }

  function setDetail(key: string, value: unknown) {
    setDetails((prev) => ({ ...prev, [key]: value }))
  }

  // Whether any field in a group already has a real value — decides that
  // group's default open/closed state (see groupIsOpen). Deliberately loose:
  // this only ever needs to distinguish "something's here" from "nothing
  // is", not validate the value itself.
  function hasValue(v: unknown): boolean {
    if (v === undefined || v === null) return false
    if (typeof v === 'string') return v.trim() !== ''
    if (Array.isArray(v)) return v.length > 0
    if (typeof v === 'boolean') return v
    return true
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
    // fields it owns — see googleFieldsForSubmit below. website is only
    // recorded when the category actually has a Website field to compare
    // against (websiteKey there mirrors this same lookup).
    // Matched by key (the fixed `googleDescription` convention — see
    // src/lib/categories.ts's showInHeader doc), not label, since a category
    // names this field's display label whatever it wants ("Description",
    // "About", …). Unlike name/phone/hours above, only FILLS a gap rather
    // than always overwriting: re-picking the address on an edit shouldn't
    // risk clobbering hand-written text. Ownership (below) is still recorded
    // against what Google actually returned regardless — a description
    // that's already present and therefore left alone is exactly the case
    // that should compare as "differs from Google" once submitted.
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors([])

    // Only submit values for fields that are actually shown (respects showIf and
    // community categories that hide hospital/address/distance/phone).
    const visibleDetails: Record<string, unknown> = {}
    for (const field of config.detailFields) {
      if (fieldIsVisible(field, details)) {
        visibleDetails[field.key] = details[field.key]
        // Carry the companion "sometimes" array for tag fields.
        if (field.type === 'tags') {
          visibleDetails[field.key + '_sometimes'] = details[field.key + '_sometimes'] ?? []
        }
      }
    }

    // Nothing to review if the edit doesn't actually propose any change —
    // whether nothing was touched at all, or a field was edited and then
    // edited right back to its original value. Skipped in the admin
    // preview, which builds a resource locally rather than submitting a
    // real edit for review. See hasListingChanged's own comment for why
    // this can't be fooled by only filling in submitter name/email — those
    // never enter `visibleDetails`/`payload` at all.
    if (!onPreviewSubmit && mode === 'edit') {
      const unchanged = !hasListingChanged(
        existing,
        { name, address: hasAddress ? address : '', phone: hasPhone ? phone : '', details: visibleDetails },
        config.detailFields,
      )
      if (unchanged) {
        setErrors(['You haven’t changed anything yet — edit a field before submitting.'])
        return
      }
    }

    if (onPreviewSubmit) {
      onPreviewSubmit({
        id: existing?.id ?? `preview-${Date.now()}`,
        category: category.id,
        name,
        anchorId: hasAddress ? 'all' : 'community',
        distance: 0,
        address: hasAddress ? address : '',
        phone: hasPhone ? phone : '',
        geo: hasAddress ? coords : null,
        ...visibleDetails,
      })
      return
    }

    const payload: ResourceSubmission = {
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
        ...visibleDetails,
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
    const submittedBy =
      submitterName.trim() || submitterEmail.trim()
        ? { name: submitterName.trim() || undefined, email: submitterEmail.trim() || undefined }
        : undefined

    setSubmitting(true)
    try {
      const res = adminSubmit
        ? await fetch(withCommunity('/api/admin/listings', community), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSubmit.token}` },
            body: JSON.stringify({ payload }),
          })
        : await fetch(withCommunity('/api/submissions', community), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              operation: mode === 'edit' ? 'update' : 'create',
              targetType: 'listing',
              targetId: mode === 'edit' ? existing?.id : undefined,
              payload,
              submittedBy,
              company: honeypot,
              turnstileToken,
            }),
          })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        // Turnstile tokens are single-use and expire after ~5 min — on a form
        // with this many fields (especially editing, reviewing everything
        // already filled in) it's easy to take longer than that before
        // hitting Submit. The server's own message says to refresh the page,
        // which would lose everything just filled in — so re-run the challenge
        // for a fresh token instead and let a second tap on Submit work.
        //
        // Gated on `code`, not on the 403 alone. This route answers 403 for
        // several unrelated refusals — a contribution type disabled site-wide,
        // a category with edits turned off — and treating those as an expired
        // challenge produced an endless "we've refreshed it, tap Submit again"
        // that no amount of tapping could clear, while hiding the real reason
        // the server gave. Not reachable in admin mode — there's no Turnstile
        // challenge to expire — but the check is harmless either way since
        // /api/admin/listings never returns this code.
        if (body.code === 'turnstile') {
          // And only offer the retry once. If a fresh token fails too, the
          // problem isn't staleness, and repeating the same hopeful message is
          // exactly the loop this is meant to end.
          if (retriedVerification) {
            setErrors([
              'Verification keeps failing. Please reload the page and try again — your details will need re-entering, sorry.',
            ])
            return
          }
          resetTurnstile()
          setRetriedVerification(true)
          setErrors(['Verification expired. We’ve refreshed it — please tap Submit again.'])
          return
        }
        // Any other outcome clears the flag: it means "the attempt just before
        // this one ended in a challenge refresh", so a genuine expiry twenty
        // minutes and several edits later still gets its own free retry.
        setRetriedVerification(false)
        setErrors(body.errors ?? ['Something went wrong. Please try again.'])
        return
      }
      setRetriedVerification(false)
      // Admin mode: the listing is already live — nothing to review, so skip
      // the "Thank you!" pending screen and just close back out.
      if (adminSubmit) onSubmitted()
      else setDone(true)
    } catch {
      setRetriedVerification(false)
      setErrors(['Network error. Please check your connection and try again.'])
    } finally {
      setSubmitting(false)
    }
  }

  const heading =
    mode === 'edit' ? 'Suggest an edit' : `Add a ${config?.label ?? 'listing'}`

  // Puts "‹ {heading}" in SiteHeader on mobile — see GenericDirectory's
  // identical call. Only the back target changes: onSubmitted once done,
  // onUp before that.
  useSetScreenHeader(!embedded, heading, done ? onSubmitted : onUp)

  if (done) {
    return (
      <div>
        {/* Non-embedded only (the admin's standalone preview/editor — every
            real Add/Edit already lives inside a dialog/sheet with its own
            close chrome, see `embedded`'s own doc): with no destination to
            name (that's what made the old Breadcrumb here redundant with
            the heading above it), just a plain way to leave the confirmation
            rather than a dead end. */}
        {!embedded && <UpButton label="Back" onClick={onSubmitted} className="mb-2" />}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <p className="text-2xl mb-2">🙏</p>
          {/* Not sr-only, unlike the other screens' bare title repeats: this
              text ("Thank you!") is never what the header says — the header
              keeps `heading` — so hiding it would remove the only place the
              confirmation is actually named, not a duplicate of it. */}
          <h2 className="text-lg font-semibold text-green-800 mb-1">Thank you!</h2>
          <p className="text-sm text-green-700">
            {doneKind === 'removal'
              ? 'Your removal request was received. A moderator will review it before anything changes.'
              : `Your ${mode === 'edit' ? 'suggested edit' : 'submission'} was received and will appear once it’s reviewed and approved.`}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {!embedded && (
        <>
          {/* The old Breadcrumb here did double duty — it also named the
              destination ("Grocery Stores"), which is what made it
              redundant with the heading right below. This keeps only the
              part that isn't: a real cancel action, since nothing else on
              this screen closes the form without submitting it. Same "Back"
              wording MapPlaceDetail's own formOpen control uses for the
              identical job. */}
          <UpButton label="Back" onClick={onUp} className="mb-2" />
          <h2 className="text-xl font-semibold text-slate-800 mb-3 sr-only desktop:not-sr-only">{heading}</h2>
        </>
      )}
      {/* Blue, not amber — this used to read as a warning (amber is this
          app's caveat/verify-this color elsewhere, e.g. Chip's amber tone),
          when it's just process information: every submission goes through
          review, nothing here is asking the visitor to double-check
          anything. Matches FormControls' own blue-50/blue-200 for the same
          "here's what happens next" tone in the intake wizards. */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3.5 py-2.5 mb-5">
        <p className="text-sm text-blue-800">
          {adminSubmit ? (
            <>
              <span className="font-semibold">Publishes immediately.</span> Adding this yourself skips
              the review queue — it goes live as soon as you submit.
            </>
          ) : (
            <>
              <span className="font-semibold">Reviewed before it goes live.</span>{' '}
              {mode === 'edit'
                ? 'This won’t change the listing — a moderator reviews it first.'
                : 'A moderator checks new listings before they appear on the site.'}
            </>
          )}
        </p>
      </div>

      {/* No outer card here — each group below (Basics, an audience section,
          a formSection, "More details") is already its own bordered box, so
          a wrapping card around all of them nested a box around boxes rather
          than adding any real structure. The form just sits directly on
          whatever surface embeds it (a dialog's own panel when `embedded`,
          the page/sheet background otherwise). */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {!adminSubmit && <Honeypot value={honeypot} onChange={setHoneypot} />}

        {/* All the edit fields, in their own toggled block — see the
            removalOpen block below for why this swaps out entirely rather
            than growing a panel underneath it. `hidden` (display:none), not
            unmounted: an unmounted TurnstileWidget would lose its pending
            challenge, and unmounting the fields themselves would drop
            anything already typed if someone opens Request removal by
            mistake and comes back. display:none fields are also excluded
            from native form validation, so a hidden required input can't
            block anything. space-y-4 is repeated here because Tailwind's
            spacing utility only affects direct children — this div is now
            one of the form's, not each field. */}
        {/* Every non-core field, grouped once so both Basics (which may
            absorb the result — see mergeMoreDetailsIntoBasics below) and
            the groups rendered further down use the same computation. */}
        {(() => {
          const nonCoreVisibleFields = config.detailFields.filter((field) => !field.coreSection && fieldIsVisible(field, details))
          const otherBlocks = groupNonCoreFields(nonCoreVisibleFields, config)
          // When "More details" is the ONLY group a category would ever
          // show — no admin has defined a real formSection or audience
          // section — AND it's small, splitting it into its own separate
          // box below Basics is a distinction without a difference: the
          // entire optional part of the form already IS that one small
          // set of fields, so folding them straight into Basics makes the
          // form genuinely one box, not two for what's really a single
          // handful of fields. Still size-gated (same <3 threshold as the
          // plain-box rule below) — a lone bucket of 8 fields is exactly
          // the "wall of fields in one box" this whole redesign exists to
          // avoid, so it keeps its own collapsible box even with nothing
          // else to distinguish it from.
          const mergeMoreDetailsIntoBasics =
            otherBlocks.length === 1 && otherBlocks[0].sectionKey === MORE_DETAILS_KEY && otherBlocks[0].fields.length < 3
          const basicsExtraFields = mergeMoreDetailsIntoBasics ? otherBlocks[0].fields : []
          const groupBlocksToRender = mergeMoreDetailsIntoBasics ? [] : otherBlocks

          const renderField = (field: CategoryField, labelOverride?: string) => (
            <DetailFieldInput
              key={field.key}
              field={field}
              labelOverride={labelOverride}
              value={details[field.key]}
              onChange={(v) => setDetail(field.key, v)}
              sometimes={field.type === 'tags' ? ((details[field.key + '_sometimes'] as string[] | undefined) ?? []) : undefined}
              onChangeSometimes={field.type === 'tags' ? (v) => setDetail(field.key + '_sometimes', v) : undefined}
            />
          )

          // Address/Name/Phone plus any coreSection field (see
          // CategoryField's doc comment) — a Google-autofillable field
          // (Hours, Website, a googleDescription field) that fills in from
          // the same address pick, so it belongs here rather than the
          // optional groups below. Shared between both Basics renderings
          // (normal and merged) so the fields themselves are never
          // duplicated, only the box/header around them differs.
          const renderBasicsFields = () => (
            <>
              {hasAddress && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address *</label>
                  <AddressInput
                    value={address}
                    onChange={setAddress}
                    onCoords={setCoords}
                    onPlaceSelect={handlePlaceSelect}
                    placeholder={syncEligible ? 'Search by business name or address…' : 'Start typing an address…'}
                    disableAutocomplete={!!onPreviewSubmit}
                  />
                </div>
              )}

              <div>
                <label htmlFor="listing-name" className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                <input id="listing-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Kosher Mart" />
              </div>

              {hasPhone && (
                <div>
                  <label htmlFor="listing-phone" className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input id="listing-phone" type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} className={inputClass} placeholder="(215) 555-0100" />
                </div>
              )}

              {config.detailFields
                .filter((field) => field.coreSection && fieldIsVisible(field, details))
                .map((field) => (
                  <DetailFieldInput
                    key={field.key}
                    field={field}
                    value={details[field.key]}
                    onChange={(v) => setDetail(field.key, v)}
                    sometimes={field.type === 'tags' ? ((details[field.key + '_sometimes'] as string[] | undefined) ?? []) : undefined}
                    onChangeSometimes={field.type === 'tags' ? (v) => setDetail(field.key + '_sometimes', v) : undefined}
                  />
                ))}
            </>
          )

          return (
        <div className={removalOpen ? 'hidden' : 'space-y-3'}>
        {mergeMoreDetailsIntoBasics ? (
          // The merged case isn't "Basics with a couple of fields tacked
          // on" — at that point it IS the whole optional part of the form,
          // so it gets the same plain, unlabeled, non-collapsible treatment
          // a small standalone "More details" already uses (see the size
          // gate below): no "Basics" header, no chevron, nothing to
          // collapse, since there's nothing else on this screen to hide it
          // from or distinguish it against.
          <div className="space-y-4 rounded-md border border-slate-200 p-3">
            {renderBasicsFields()}
            {basicsExtraFields.map((field) => renderField(field))}
          </div>
        ) : (
        /* Basics: one collapsible group, open by default (unlike the
            optional ones, which default to open only once they already
            hold a value) since this is what makes the listing a listing
            at all — see groupIsOpen. */
        (() => {
          const basicsOpen = groupIsOpen('basics', true)
          return (
            // No overflow-hidden — it was clipping a multi-select field's
            // own dropdown popover to this box's bounds the moment that
            // field lived inside a group (the popover is position:absolute,
            // meant to overlay outside the box). rounded-t-md on the header
            // below does the (much smaller) job overflow-hidden used to:
            // keeping its own background from squaring off past the box's
            // rounded top corners.
            <div className="border border-slate-200 rounded-md">
              <button
                type="button"
                onClick={() => toggleGroup('basics', basicsOpen)}
                aria-expanded={basicsOpen}
                className="w-full flex items-center justify-between gap-2 rounded-t-md px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Basics</span>
                <svg
                  className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${basicsOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {/* Hidden, not unmounted, when collapsed — same reasoning as
                  the removalOpen swap above: AddressInput and anything
                  already typed here shouldn't reset just because someone
                  tapped the collapse control, and a hidden required input
                  is excluded from native validation, so nothing blocks
                  submission while this is closed. */}
              <div className={basicsOpen ? 'p-3 space-y-4' : 'hidden'}>
                  {renderBasicsFields()}
              </div>
            </div>
          )
        })()
        )}

        {groupBlocksToRender.length > 0 && (
          <div className="space-y-3">
            {groupBlocksToRender.map((block) => {
                // The plain, unlabeled, non-collapsible treatment (see
                // mergeMoreDetailsIntoBasics above) is ONLY for a lone small
                // "More details" that becomes the whole form — it folds into
                // Basics and never reaches this list at all. Every block
                // that DOES reach here (an audience section, a formSection,
                // or "More details" alongside real sections) gets the full
                // label-and-collapse treatment regardless of its own size:
                // once other named groups exist, a small "More details"
                // reads as one bucket among several, not the whole form, so
                // it keeps the same header every other bucket has.

                // An audience section defaults OPEN the moment it exists at
                // all — checking its gate box (e.g. "Women's Tevillah") is
                // already the explicit signal that these fields are wanted,
                // so it shouldn't also require them to already hold a value
                // before showing. A generic (formSection/"More details")
                // group has no such gate, so it defaults open only once it
                // already holds a value (real in edit; never true in create)
                // and collapsed otherwise — see groupIsOpen/hasValue.
                const hasData = block.fields.some((f) => hasValue(details[f.key]))
                const open = groupIsOpen(block.sectionKey, block.isAudience || hasData)
                return (
                  // No overflow-hidden — see Basics above for why (it clips
                  // a multi-select field's own dropdown to this box).
                  <div key={block.sectionKey} className="border border-slate-200 rounded-md">
                    <button
                      type="button"
                      onClick={() => toggleGroup(block.sectionKey, open)}
                      aria-expanded={open}
                      className="w-full flex items-center justify-between gap-2 rounded-t-md px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <span className="flex flex-col items-start text-left">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {block.label}
                          {/* Only in edit: create has nothing filled in
                              anywhere yet, so labeling every group "not
                              added" would just be noise, not information. */}
                          {mode === 'edit' && !hasData && (
                            <span className="ml-1 font-normal normal-case text-muted">— not added</span>
                          )}
                        </span>
                        {block.description && (
                          <span className="text-[11px] font-normal normal-case text-muted">{block.description}</span>
                        )}
                      </span>
                      <svg
                        className={`w-3.5 h-3.5 shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {/* Hidden, not unmounted — same reasoning as Basics
                        above: a closed group shouldn't drop anything
                        already typed inside it. */}
                    <div className={open ? 'p-3 space-y-4' : 'hidden'}>
                      {block.fields.map((field) => renderField(field, block.isAudience ? field.shortLabel : undefined))}
                    </div>
                  </div>
                )
            })}
          </div>
        )}

        {!adminSubmit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200 pt-4">
            <div>
              <label htmlFor="listing-submitter-name" className="block text-sm font-medium text-slate-700 mb-1">Your name (optional)</label>
              <input id="listing-submitter-name" value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="listing-submitter-email" className="block text-sm font-medium text-slate-700 mb-1">Your email (optional)</label>
              <input id="listing-submitter-email" type="email" value={submitterEmail} onChange={(e) => setSubmitterEmail(e.target.value)} className={inputClass} />
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <ul className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 list-disc list-inside space-y-0.5">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        )}
        </div>
          )
        })()}

        {/* Outside the toggled block above — see its own comment: a
            TurnstileWidget that unmounted when switching to Request removal
            would lose its pending challenge and never resolve, leaving that
            button stuck on "Verifying…" forever. One instance, always
            mounted, serves both. */}
        {!adminSubmit && !sharedTurnstile && <TurnstileWidget ref={ownTurnstileRef} onVerify={setOwnTurnstileToken} />}

        {/* Disabled until a token is actually in hand (when Turnstile is
            configured) — otherwise a visitor who fills the form faster than
            the background challenge completes could submit with an empty
            token and get rejected for no visible reason. An admin submission
            has no Turnstile challenge at all, so it's never gated on one. */}
        {/* Submit and Request removal, both full width, stacked — on both
            mobile and desktop, not split side by side on the wider one. A
            50/50 split visually says "two equally likely choices", but
            almost everyone opening this form wants to fix something, not
            remove the listing; full width on top, the other option directly
            below it, reads as "here's the main thing" rather than a coin
            flip. The dialog itself is capped well under 600px regardless of
            window size, so a full-width button here was never actually
            wide enough to look stretched. */}
        <div className={removalOpen ? 'hidden' : 'flex flex-col gap-3'}>
          <button
            type="submit"
            disabled={submitting || (!adminSubmit && TURNSTILE_ACTIVE && !turnstileToken)}
            className="w-full bg-primary text-white font-medium px-5 py-2.5 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting
              ? 'Submitting…'
              : adminSubmit
                ? 'Add listing'
                : TURNSTILE_ACTIVE && !turnstileToken
                  ? 'Verifying…'
                  : mode === 'edit'
                    ? 'Submit edit for review'
                    : 'Submit for review'}
          </button>

          {/* Solid red — the strong visual cue belongs HERE, where this
              button sits beside Submit and has to read as "the other
              option" at a glance. RemovalRequest's own confirm button is the
              reverse (outline, not solid): once someone is on that screen
              the heading already says "Request removal of {name}", so the
              button no longer needs to carry the cue itself. */}
          {canRequestRemoval && (
            <button
              type="button"
              onClick={() => setRemovalOpen(true)}
              className="w-full rounded-md bg-red-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-red-700 cursor-pointer"
            >
              Request removal
            </button>
          )}
        </div>

        {/* Swaps the whole panel in place — the same pattern Edit itself
            already uses to replace a listing's detail view (see
            MapPlaceDetail/ListingDetailModal's own doc) — rather than
            growing an accordion under an already-long field list. Confirmed
            live as the better call: on a category with a lot of fields
            (minyanim, audience sections), an appended panel meant scrolling
            past a form you'd already decided not to submit just to reach
            the reason picker, and it read as a stray dropdown bolted onto
            the bottom of an unrelated screen rather than its own real step.
            Kept in the DOM (hidden, not conditionally unmounted) so a reason
            already typed survives switching back and forth. No card here —
            RemovalRequest boxes just its own reason/details question, the
            same "a box is a field group" rule the edit fields above use;
            name/email and the actions stay bare on both screens instead of
            one nesting everything in an outer card the other doesn't. */}
        {canRequestRemoval && (
          <div className={removalOpen ? '' : 'hidden'}>
            <RemovalRequest
              listing={{ id: existing!.id, name: existing!.name }}
              turnstileToken={turnstileToken}
              canSubmit={!TURNSTILE_ACTIVE || !!turnstileToken}
              resetTurnstile={resetTurnstile}
              honeypot={honeypot}
              submitterName={submitterName}
              onSubmitterNameChange={setSubmitterName}
              submitterEmail={submitterEmail}
              onSubmitterEmailChange={setSubmitterEmail}
              onCancel={() => setRemovalOpen(false)}
              onDone={() => {
                setDoneKind('removal')
                setDone(true)
              }}
            />
          </div>
        )}

        <PrivacyNote />
      </form>
    </div>
  )
}

function DetailFieldInput({
  field,
  labelOverride,
  value,
  onChange,
  sometimes,
  onChangeSometimes,
}: {
  field: CategoryField
  /** Shown instead of field.label — used inside an audience section so
   *  "Women's Phone" reads as just "Phone" under the "Women's" heading. */
  labelOverride?: string
  value: unknown
  onChange: (value: unknown) => void
  sometimes?: string[]
  onChangeSometimes?: (v: string[]) => void
}) {
  const label = `${labelOverride ?? field.label}${field.required ? ' *' : ''}`

  if (field.type === 'tags') {
    return (
      <TagsInput
        field={field}
        value={(value as string[]) ?? []}
        onChange={onChange}
        sometimes={sometimes}
        onChangeSometimes={onChangeSometimes}
      />
    )
  }

  if (field.type === 'url') {
    return (
      <div>
        <label htmlFor={`detail-${field.key}`} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <input
          id={`detail-${field.key}`}
          type="url"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          // Adds "https://" once they're done typing — almost nobody types the
          // scheme by hand, but doing this on every keystroke (instead of on
          // blur) would fight typing/pasting a real https:// URL mid-edit.
          onBlur={(e) => onChange(normalizeUrl(e.target.value))}
          placeholder={field.placeholder ?? 'example.com'}
          className={inputClass}
        />
        {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
      </div>
    )
  }

  if (field.type === 'image') {
    return (
      <div>
        <span className="block text-sm font-medium text-slate-700 mb-1">{labelOverride ?? field.label}</span>
        {/* Every other field type gets its visual weight for free — a
            select/textarea/input is browser-rendered with its own border.
            The photo picker is several loose pieces (a preview, three
            buttons, a hint line) with no such border of its own, so next to
            a stack of bordered fields it read as scattered UI rather than
            one field — same reasoning the boolean checkbox got its own box
            for earlier. */}
        <div className="rounded-md border border-slate-300 p-3">
          <ImageUploadField
            value={(value as string) ?? ''}
            onChange={onChange}
            uploadUrl="/api/submissions/photo"
            // Wherever this photo actually renders (CategoryIcon's callers —
            // map pins, listing cards, place detail) it's always circular, so
            // the crop step's own guide has to match that, not show a square
            // shape and let corners the visitor thinks are kept quietly get
            // clipped away later.
            shape="circle"
            // No helpText ("Shown instead of the category's usual icon…") —
            // same self-explanatory-copy trim as the reposition hint below:
            // it becomes obvious once there's a photo, and the field is
            // already labeled "Photo *". No collapseUrlInput exception here
            // (admin's own uploaders keep the URL row always visible) — most
            // visitors upload a file, so a permanently-visible label+input for
            // that edge case was exactly the bulk this field didn't need.
            showRepositionHint={false}
            collapseUrlInput
          />
        </div>
      </div>
    )
  }

  if (field.type === 'boolean') {
    return (
      <div>
        {/* Same border/rounded/px-3 py-2 footprint as a text input or select
            (see inputClass) — a bare checkbox+label with no box at all read
            as a much lighter, stray element next to a stack of full-width
            bordered fields, especially wedged between two of them. Still a
            checkbox, not a Yes/No dropdown: this is the direct, established
            control for a boolean everywhere else in the app, and a dropdown
            would trade one inconsistency (visual weight) for a worse one
            (an extra click, and a state that starts on neither answer). */}
        <label className="flex items-center gap-2 cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 shrink-0 rounded border-slate-300 text-primary focus:ring-primary"
          />
          <span className="text-sm text-slate-700">{labelOverride ?? field.label}</span>
        </label>
        {/* Flush left, matching every other field's help text (no more
            ml-6 offset to align under the label past the checkbox — the
            whole control is boxed now, so this reads as "about the box
            above", same as a select or text field's help line). */}
        {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
      </div>
    )
  }

  if (field.type === 'hours') {
    return <HoursInput label={label} value={value} onChange={onChange} />
  }

  if (field.type === 'minyanim') {
    return <MinyanimInput label={label} value={value} onChange={onChange} />
  }

  if (field.type === 'textarea') {
    return (
      <div>
        <label htmlFor={`detail-${field.key}`} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <textarea id={`detail-${field.key}`} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.placeholder} className={inputClass} />
        {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
      </div>
    )
  }

  if (field.type === 'select' && field.multiSelect) {
    return <MultiSelectField field={field} label={label} value={value} onChange={onChange} />
  }

  if (field.type === 'select' && field.allowOther) {
    return <SelectOtherField field={field} label={label} value={value} onChange={onChange} />
  }

  if (field.type === 'select') {
    return (
      <div>
        <label htmlFor={`detail-${field.key}`} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <select id={`detail-${field.key}`} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Select…</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
      </div>
    )
  }

  return (
    <div>
      <label htmlFor={`detail-${field.key}`} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        id={`detail-${field.key}`}
        type={field.type === 'number' ? 'number' : field.type === 'tel' ? 'tel' : 'text'}
        value={(value as string) ?? ''}
        onChange={(e) =>
          onChange(
            field.type === 'number'
              ? Number(e.target.value)
              // Same live formatting as the main Phone field (see formatPhone)
              // — a category's own "Women's Phone"-style field shouldn't look
              // different just because it isn't the built-in one.
              : field.type === 'tel'
                ? formatPhone(e.target.value)
                : e.target.value,
          )
        }
        placeholder={field.placeholder}
        // Only meaningful for type: 'text' (see CategoryField.headerMaxLength)
        // — a plain <input> can't contain a newline in the first place, so
        // this is purely the character cap, guaranteeing the value fits the
        // collapsed card's one line without any CSS truncation needed.
        maxLength={field.type === 'text' ? field.headerMaxLength : undefined}
        className={inputClass}
      />
      {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
      {field.type === 'text' && field.headerMaxLength != null && (
        <p className="text-xs text-muted mt-1">
          {((value as string) ?? '').length}/{field.headerMaxLength}
        </p>
      )}
    </div>
  )
}

// A single-value Choice field with an "Other…" option (see
// CategoryField.allowOther) — its own component (not just another branch in
// DetailFieldInput) because it needs its own local state: whether the
// free-text box is showing. Starts open if the saved value doesn't match any
// of the field's own options — an edit of a listing whose value came from a
// choice the admin has since renamed or removed reopens with that value
// still there, in the box, instead of silently discarding it back to blank.
function SelectOtherField({
  field,
  label,
  value,
  onChange,
}: {
  field: CategoryField
  label: string
  value: unknown
  onChange: (value: unknown) => void
}) {
  const strValue = (value as string) ?? ''
  const isKnownOption = (field.options ?? []).some((opt) => opt.value === strValue)
  const [showOther, setShowOther] = useState(strValue !== '' && !isKnownOption)

  return (
    <div>
      <label htmlFor={`detail-${field.key}`} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <select
        id={`detail-${field.key}`}
        value={showOther ? OTHER_OPTION_VALUE : strValue}
        onChange={(e) => {
          if (e.target.value === OTHER_OPTION_VALUE) {
            setShowOther(true)
            onChange('')
          } else {
            setShowOther(false)
            onChange(e.target.value)
          }
        }}
        className={inputClass}
      >
        <option value="">Select…</option>
        {field.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        <option value={OTHER_OPTION_VALUE}>Other…</option>
      </select>
      {showOther && (
        <input
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Please specify"
          autoFocus
          className={`${inputClass} mt-2`}
        />
      )}
      {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
    </div>
  )
}

// Never a real option value (admin-typed choices come from free text, but a
// literal match is astronomically unlikely and harmless either way — worst
// case, that one choice can't be selected without going through the "Other"
// box, which still saves the same string). Not persisted anywhere itself;
// it only ever exists as this <select>'s transient value.
const OTHER_OPTION_VALUE = '__other__'

// Badge-shown choice fields always allow more than one value on a single
// listing (e.g. a place that's both a Restaurant and a Caterer) — see
// `selectValues` for why the stored shape can still be a bare string on
// older listings.
//
// A real closed dropdown (like SelectOtherField's <select>), not
// always-expanded pills sitting inline — this is the intake/edit form, and a
// long Choice field (Kosher Certification's 10+ options) shouldn't push
// every other field down the page just to show its own state. Closed, it
// reads as a single boxed control with a summary of what's picked, exactly
// like any other field here; open, it's a checklist popover (plus an
// "Other…" row when the field allows it — see CategoryField.allowOther).
// Only the form uses this: the map/directory's own multi-select FILTER
// controls are a different component (CheckboxDropdown) for a different
// purpose (narrowing a list, not entering a value) and aren't touched here.
function MultiSelectField({
  field,
  label,
  value,
  onChange,
}: {
  field: CategoryField
  label: string
  value: unknown
  onChange: (value: unknown) => void
}) {
  const chosen = selectValues(value)
  const options = field.options ?? []
  const knownValues = new Set(options.map((opt) => opt.value))
  // Already-chosen values that aren't one of the field's own options — e.g.
  // someone typed "Vegan Certification" into Other on a previous edit. Shown
  // as their own checked rows alongside the regular ones, so a custom pick
  // from before doesn't just vanish the next time this listing is edited.
  const customChosen = chosen.filter((v) => !knownValues.has(v))
  const [open, setOpen] = useState(false)
  const [addingOther, setAddingOther] = useState(false)
  const [otherText, setOtherText] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setAddingOther(false)
      }
    }
    document.addEventListener('mousedown', handleClick, true)
    document.addEventListener('touchstart', handleClick, true)
    return () => {
      document.removeEventListener('mousedown', handleClick, true)
      document.removeEventListener('touchstart', handleClick, true)
    }
  }, [open])

  function toggle(v: string) {
    onChange(chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v])
  }
  function labelFor(v: string): string {
    return options.find((opt) => opt.value === v)?.label ?? v
  }
  function commitOther() {
    const v = otherText.trim()
    setAddingOther(false)
    setOtherText('')
    if (!v || chosen.includes(v)) return
    onChange([...chosen, v])
  }

  const summary = chosen.length > 0 ? chosen.map(labelFor).join(', ') : 'Select…'

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={`detail-${field.key}`} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <button
        id={`detail-${field.key}`}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`${inputClass} flex items-center justify-between gap-2 text-left ${chosen.length === 0 ? 'text-slate-400' : ''}`}
      >
        <span className="truncate">{summary}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={chosen.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="accent-primary h-3.5 w-3.5 shrink-0 cursor-pointer"
              />
              {opt.label}
            </label>
          ))}
          {customChosen.map((v) => (
            <label
              key={v}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked
                onChange={() => toggle(v)}
                className="accent-primary h-3.5 w-3.5 shrink-0 cursor-pointer"
              />
              {v}
            </label>
          ))}
          {field.allowOther && (
            addingOther ? (
              <div className="flex gap-1.5 px-3 py-2">
                <input
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitOther()
                    } else if (e.key === 'Escape') {
                      setAddingOther(false)
                      setOtherText('')
                    }
                  }}
                  placeholder="Type your own…"
                  autoFocus
                  className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={commitOther}
                  className="shrink-0 text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingOther(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 cursor-pointer"
              >
                + Other…
              </button>
            )
          )}
        </div>
      )}
      {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
    </div>
  )
}
