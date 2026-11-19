import { isCategorySyncEligible } from './categories'
import { readContacts } from './contacts'
import { keepsMenuLink } from './menuLink'
import { validateSubmission } from './resourceStore'
import { SERVER_ONLY_PAYLOAD_KEYS } from './submissionSource'
import { submitterDetails } from './syncFields'
import { normalizeUrl } from './validation'
import type { ResourceSubmission } from '@/types'
import type { CategoryConfig } from './categories'

/**
 * What every visitor's listing goes through before it is filed, from the
 * listing form (/api/submissions) and the "+ Add" box (/api/message/send)
 * alike, in place on `payload`:
 *
 * - The site's own keys come off: where it came from ("Read by AI"), an
 *   admin's fixes, sync state, an admin's status override, item dates.
 *   Nothing downstream refuses them and the moderation diff hides them.
 * - A list of contacts is tidied as typed ("215-805-8668, ").
 * - A bare website gets its scheme, before validating and storing.
 *
 * Returns the validator's messages; empty when it can be filed.
 */
export function prepareSubmission(
  payload: ResourceSubmission,
  category: CategoryConfig | null | undefined,
  opts: { operation: 'create' | 'update'; storedPlaceId?: string | null },
): string[] {
  for (const k of SERVER_ONLY_PAYLOAD_KEYS) delete (payload as Record<string, unknown>)[k]
  if (payload.details && typeof payload.details === 'object') {
    payload.details = submitterDetails(payload.details, {
      operation: opts.operation,
      fieldKeys: category?.detailFields.map((f) => f.key) ?? [],
      syncEligible: category ? isCategorySyncEligible(category) : false,
      storedPlaceId: opts.storedPlaceId ?? undefined,
      keepsMenuLink: keepsMenuLink(category),
    })
    for (const field of category?.detailFields ?? []) {
      if (field.type === 'contacts' && field.key in payload.details) payload.details[field.key] = readContacts(payload.details[field.key])
      if (field.type !== 'url') continue
      const raw = payload.details[field.key]
      if (typeof raw === 'string' && raw.trim()) payload.details[field.key] = normalizeUrl(raw)
    }
  }
  return validateSubmission(payload, category ?? null)
}
