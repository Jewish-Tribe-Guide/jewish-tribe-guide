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
  'lastSyncError',
  'lastSyncFailedAt',
  'businessStatus',
  'businessStatusBefore',
  'businessStatusChangedAt',
  'businessStatusOverride',
  'googleDescription',
  'verifiedPlaceId',
  'legacyId',
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
