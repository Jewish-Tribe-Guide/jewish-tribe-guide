// Detail keys that belong to the app, not to a person.
//
// Google-sync provenance and geocoding bookkeeping: written by the sync job
// and the submission pipeline, never authored by an admin or a submitter. Two
// places need to agree about them and used to keep their own lists:
// submissionStore (which strips them off an incoming submission) and the
// moderation card (which hides them from the diff).
//
// They drifted, and the drift was visible to a real moderator: the card knew
// about `businessStatus` but not `businessStatusBefore` or
// `businessStatusChangedAt`, so a davening-times edit rendered
// "businessStatusBefore UNKNOWN → —" underneath it, as though the submitter
// had proposed something about it.
//
// One list, so the next bookkeeping field is hidden by both the moment it is
// added here.
export const SYNC_INTERNAL_FIELDS = [
  'googleSyncedAt',
  'googleStatusCheckedAt',
  'lastSyncError',
  'lastSyncFailedAt',
  'businessStatus',
  'businessStatusBefore',
  'businessStatusChangedAt',
  'businessStatusOverride',
  'googleDescription',
  'verifiedPlaceId',
  'legacyId',
  // When each grocery item was last seen. Computed on approval from the
  // stored row (submissionStore's withItemDates), never taken from a
  // submission, and not something a moderator is approving.
  'itemSeen',
  // Items a visitor has said are gone, while an admin decides (the
  // removal is its own submission). Set by mark_item, cleared by
  // rejecting that removal or a later "Still here".
  'itemGone',
] as const

/** Additionally hidden from the moderation diff, though a submitter MAY change
 *  them: coordinates and Google ids are carried explicitly by the form, and
 *  `googleFields`/`googleAutofill` are recomputed rather than authored — the
 *  sync cron and the submission form can land on the same set in a different
 *  order, which would otherwise read as a change nobody made. */
export const DIFF_ONLY_HIDDEN_FIELDS = ['geo', 'placeId', 'googleFields', 'googleAutofill'] as const

/** `googleDescription` is the one exception in either direction: some
 *  categories configure it as a real, human-editable "Description" field, and
 *  there it IS content a moderator should see. The diff hides it only when the
 *  category never configured it — see SKIP_WHEN_UNCONFIGURED. */
export const SHOWN_WHEN_CONFIGURED = 'googleDescription'

/** The one internal a submission may still carry: picking an address reads
 *  the place's status off Google (AddressInput → ListingForm), so a new
 *  listing isn't published with no status at all. Shown in the moderation
 *  diff whenever a submission carries it — see submitterDetails for when
 *  that is. */
export const SHOWN_WHEN_PROPOSED = 'businessStatus'

const GOOGLE_BUSINESS_STATUSES: ReadonlySet<unknown> = new Set(['OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY'])

/**
 * A submitter's `details` with the app's own keys taken off, for the public
 * submissions route to file.
 *
 * Nothing else stood in the way. The validator checks only the category's
 * configured fields and ignores the rest, approval keeps a stored internal
 * only when the edit didn't supply one, and the diff hides every one of these
 * keys — so a hand-made POST could set `businessStatusOverride`,
 * `googleSyncedAt` or `verifiedPlaceId` on a listing, and the admin approving
 * it would see nothing about it in the queue.
 *
 * Two kinds are a person's to send, and are kept:
 * - `googleDescription` where the category configures it as a field (it is
 *   then a real, editable Description — see SHOWN_WHEN_CONFIGURED);
 * - `businessStatus` read off a place picked just now: a real Google status,
 *   in a category the sync covers, with a placeId that is new — every create,
 *   or an edit that changed the place. An edit that kept its place drops it,
 *   and approval keeps the listing's stored status, which the sync may have
 *   updated since the form loaded.
 */
export function submitterDetails(
  details: Record<string, unknown>,
  ctx: {
    operation: 'create' | 'update'
    fieldKeys: readonly string[]
    syncEligible: boolean
    storedPlaceId?: unknown
  },
): Record<string, unknown> {
  const placeId = details.placeId
  const pickedNewPlace =
    typeof placeId === 'string' && placeId !== '' && (ctx.operation === 'create' || placeId !== ctx.storedPlaceId)
  const keepStatus = ctx.syncEligible && pickedNewPlace && GOOGLE_BUSINESS_STATUSES.has(details[SHOWN_WHEN_PROPOSED])
  const next = { ...details }
  for (const key of SYNC_INTERNAL_FIELDS) {
    if (key === SHOWN_WHEN_CONFIGURED && ctx.fieldKeys.includes(key)) continue
    if (key === SHOWN_WHEN_PROPOSED && keepStatus) continue
    delete next[key]
  }
  return next
}
