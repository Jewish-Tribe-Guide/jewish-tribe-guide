import { useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import { fetchJson } from '@/lib/fetchJson'
import {
  detectOptionRenames,
  fieldsWithRenamedShowIf,
  mergeFieldsWithHidden,
  normalizeField,
  removedFieldKeys,
  validateDraft,
  type Draft,
} from './categoryEditorLogic'

// ── The save workflow: validation, the two destructive-change confirmation
// gates (option-rename migration, field-removal cleanup), and the actual
// create/update request. Only ever reads `draft`, never owns it — that's
// useCategoryFieldEditing's job. ──

export function useCategorySaveWorkflow({
  draft,
  initial,
  isNew,
  token,
  onSaved,
}: {
  draft: Draft
  initial: CategoryConfig | null
  isNew: boolean
  token: string
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  // Set once a save attempt finds existing listings with data in a field the
  // admin just removed (or an address/phone toggle they just turned off) — a
  // confirmation gate before that data is wiped for real. Cleared on cancel or
  // once the confirmed save completes.
  const [pendingCleanup, setPendingCleanup] = useState<{
    address: number
    phone: number
    fields: Record<string, number>
    addressOff: boolean
    phoneOff: boolean
    removedKeys: string[]
  } | null>(null)
  // Set once a save attempt detects what looks like a select/tags option
  // rename (see detectOptionRenames) and has fetched how many existing
  // listings currently store the old value — a confirmation gate before that
  // data is migrated for real. Cleared on cancel or once the confirmed save
  // completes.
  const [pendingRename, setPendingRename] = useState<{
    renames: { fieldKey: string; fieldLabel: string; oldValue: string; newValue: string; count: number }[]
  } | null>(null)

  function cancelCleanup() {
    setPendingCleanup(null)
  }

  function cancelRename() {
    setPendingRename(null)
  }

  async function save(opts?: { skipRename?: boolean }) {
    const errs = validateDraft(draft)
    if (errs.length) {
      setErrors(errs)
      return
    }
    setErrors([])

    // Editing an existing category and it looks like a select/tags option got
    // renamed: check how many existing listings still have the old value
    // before offering to migrate them — skip once the admin has already
    // confirmed (pendingRename is set) or explicitly declined (skipRename,
    // the "this wasn't actually a rename" escape hatch) so re-clicking Save
    // doesn't loop.
    if (!isNew && !pendingRename && !opts?.skipRename) {
      const detected = detectOptionRenames(draft, initial)
      if (detected.length > 0) {
        setSaving(true)
        try {
          const body = await fetchJson<{ usage: { fieldKey: string; oldValue: string; newValue: string; count: number }[] }>(
            `/api/admin/categories/${initial!.id}/option-usage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ renames: detected }),
            },
            'Could not check existing listings.',
          )
          const usage = body.usage
          setPendingRename({
            renames: detected.map((d) => ({
              ...d,
              count: usage.find((u) => u.fieldKey === d.fieldKey && u.oldValue === d.oldValue)?.count ?? 0,
            })),
          })
          return
        } catch (err) {
          setErrors([err instanceof Error ? err.message : 'Could not check existing listings.'])
          return
        } finally {
          setSaving(false)
        }
      }
    }

    // Editing an existing category, turning off address/phone or dropping a
    // field: check whether any existing listings actually have data there
    // before wiping it — skip the check once the admin has already confirmed
    // (pendingCleanup is set) so re-clicking Save doesn't loop.
    if (!isNew && !pendingCleanup) {
      const addressOff = initial!.hasAddress !== false && !draft.hasAddress
      const phoneOff = initial!.hasPhone !== false && !draft.hasPhone
      const removedKeys = removedFieldKeys(draft, initial)
      if (addressOff || phoneOff || removedKeys.length > 0) {
        setSaving(true)
        try {
          const body = await fetchJson<{ usage: { address: number; phone: number; fields: Record<string, number> } }>(
            `/api/admin/categories/${initial!.id}/field-usage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ address: addressOff, phone: phoneOff, fieldKeys: removedKeys }),
            },
            'Could not check existing listings.',
          )
          const usage = body.usage
          const total = usage.address + usage.phone + Object.values(usage.fields).reduce((a, b) => a + b, 0)
          if (total > 0) {
            setPendingCleanup({ ...usage, addressOff, phoneOff, removedKeys })
            return
          }
        } catch (err) {
          setErrors([err instanceof Error ? err.message : 'Could not check existing listings.'])
          return
        } finally {
          setSaving(false)
        }
      }
    }

    setSaving(true)
    try {
      const payload = {
        label: draft.label,
        pluralLabel: draft.pluralLabel || draft.label,
        icon: draft.icon,
        iconImageUrl: draft.iconImageUrl.trim() || null,
        description: draft.description,
        hasAddress: draft.hasAddress,
        hasPhone: draft.hasPhone,
        upvotesEnabled: draft.upvotesEnabled,
        capabilities: draft.capabilities,
        externalLink:
          draft.externalLinkEnabled && draft.externalLinkLabel.trim() && draft.externalLinkUrl.trim()
            ? { label: draft.externalLinkLabel.trim(), url: draft.externalLinkUrl.trim() }
            : null,
        cardImageUrl: draft.cardImageUrl.trim() || null,
        cardTextColor: draft.cardImageUrl.trim() ? draft.cardTextColor : null,
        // Apply the implied filter/tag rules, keep any showIf pointed at a
        // renamed option's new value, then re-merge the preserved hidden
        // fields so editing never drops them.
        fields: mergeFieldsWithHidden(
          fieldsWithRenamedShowIf(draft.fields.map(normalizeField), opts?.skipRename ? [] : (pendingRename?.renames ?? [])),
          draft.hiddenFields,
        ),
        ...(pendingCleanup && {
          clearFields: {
            address: pendingCleanup.addressOff,
            phone: pendingCleanup.phoneOff,
            keys: pendingCleanup.removedKeys,
          },
        }),
        ...(pendingRename &&
          !opts?.skipRename && {
            applyOptionRenames: pendingRename.renames.map(({ fieldKey, oldValue, newValue }) => ({
              fieldKey,
              oldValue,
              newValue,
            })),
          }),
      }
      await fetchJson(
        isNew ? '/api/admin/categories' : `/api/admin/categories/${initial!.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        },
        'Save failed.',
      )
      onSaved()
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Save failed.'])
    } finally {
      setSaving(false)
      setPendingCleanup(null)
      setPendingRename(null)
    }
  }

  return { saving, errors, pendingCleanup, pendingRename, save, cancelCleanup, cancelRename }
}
