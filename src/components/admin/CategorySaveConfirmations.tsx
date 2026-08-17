'use client'

import type { CategoryConfig } from '@/lib/categories'

// ── The two confirmation gates CategoryEditor's save() falls into before a
// destructive or data-migrating change goes through. ──

// Blocks the save until the admin explicitly confirms wiping the field(s) they
// just removed (or turned off) from every existing listing in this category —
// irreversible, so it replaces the normal Save/Cancel row rather than being an
// easy-to-miss inline notice.
export function CleanupConfirm({
  cleanup,
  initial,
  saving,
  onCancel,
  onConfirm,
}: {
  cleanup: { address: number; phone: number; fields: Record<string, number>; addressOff: boolean; phoneOff: boolean; removedKeys: string[] }
  initial: CategoryConfig | null
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const items: { label: string; count: number }[] = [
    ...(cleanup.addressOff && cleanup.address > 0 ? [{ label: 'Address', count: cleanup.address }] : []),
    ...(cleanup.phoneOff && cleanup.phone > 0 ? [{ label: 'Phone number', count: cleanup.phone }] : []),
    ...cleanup.removedKeys
      .filter((k) => (cleanup.fields[k] ?? 0) > 0)
      .map((k) => ({
        label: initial?.detailFields.find((f) => f.key === k)?.label ?? k,
        count: cleanup.fields[k],
      })),
  ]

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
      <p className="text-sm font-medium text-amber-900">This will permanently clear data from existing listings</p>
      <ul className="text-sm text-amber-800 list-disc list-inside space-y-0.5">
        {items.map((it) => (
          <li key={it.label}>
            {it.label} — {it.count} listing{it.count !== 1 ? 's' : ''}
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-700">This can&rsquo;t be undone. To keep the data, cancel and undo the removal above instead.</p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={saving}
          className="text-sm font-medium bg-red-600 text-white rounded-md px-4 py-2 hover:bg-red-700 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Clear and save'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// Blocks the save until the admin confirms migrating existing listings' data
// to match a detected option rename (see detectOptionRenames) — a helpful
// correction rather than data loss, so this uses a neutral/blue tone instead
// of CleanupConfirm's amber warning, but still replaces the normal Save/
// Cancel row so it can't be missed. "Save without updating" is the escape
// hatch for the rare case the admin genuinely meant to remove the old option
// and add an unrelated new one, not rename it.
export function RenameConfirm({
  rename,
  saving,
  onCancel,
  onConfirm,
  onSkip,
}: {
  rename: { renames: { fieldKey: string; fieldLabel: string; oldValue: string; newValue: string; count: number }[] }
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
  onSkip: () => void
}) {
  const withListings = rename.renames.filter((r) => r.count > 0)
  return (
    <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 space-y-3">
      <p className="text-sm font-medium text-sky-900">Update existing listings to match this rename?</p>
      <ul className="text-sm text-sky-800 list-disc list-inside space-y-0.5">
        {rename.renames.map((r) => (
          <li key={r.fieldKey}>
            {r.fieldLabel}: “{r.oldValue}” → “{r.newValue}”
            {r.count > 0 ? ` — ${r.count} listing${r.count !== 1 ? 's' : ''}` : ' — no listings currently use this'}
          </li>
        ))}
      </ul>
      {withListings.length > 0 && (
        <p className="text-xs text-sky-700">
          Without this, those listings would keep the old value, which no longer matches any option — effectively
          hiding this from them until fixed by hand.
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={saving}
          className="text-sm font-medium bg-primary text-white rounded-md px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Update listings & save'}
        </button>
        <button
          onClick={onSkip}
          disabled={saving}
          className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
          title="This wasn't a rename — I removed one option and added an unrelated one on purpose."
        >
          Save without updating
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-sm font-medium text-slate-500 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
