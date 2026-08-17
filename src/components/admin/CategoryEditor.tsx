'use client'

import { useEffect, useState } from 'react'
import { CATEGORY_CAPABILITY_KEYS, DEFAULT_CATEGORY_ICON, type CategoryConfig } from '@/lib/categories'
import { CATEGORY_TEMPLATES } from '@/lib/categoryTemplates'
import CategoryPreview from './CategoryPreview'
import { CardBackgroundField, IconField, inputClass } from './CategoryFormFields'
import { FieldEditor } from './CategoryFieldEditor'
import { CleanupConfirm, RenameConfirm } from './CategorySaveConfirmations'
import { CAPABILITY_LABELS, mergeFieldsWithHidden, normalizeField } from './categoryEditorLogic'
import { useCategoryFieldEditing } from './useCategoryFieldEditing'
import { useCategorySaveWorkflow } from './useCategorySaveWorkflow'

export function CategoryEditor({
  token,
  initial,
  hasMapCategory,
  onSaved,
  onCancel,
}: {
  token: string
  initial: CategoryConfig | null
  /** Whether a Map pseudo-category currently exists — the "Map button"
   *  capability only makes sense (and is only offered) when there's a map for
   *  it to send this category's listings to. */
  hasMapCategory: boolean
  onSaved: () => void
  onCancel: () => void
}) {
  const isNew = initial === null
  const [previewing, setPreviewing] = useState(false)

  const {
    draft,
    lastAppliedTemplate,
    groupForm,
    setGroupForm,
    set,
    setName,
    setCap,
    applyTemplate,
    updateField,
    addField,
    removeField,
    addAudienceGroup,
    isPlainHoursField,
    isWebsiteField,
    isPhotoField,
    toggleHoursField,
    toggleWebsiteField,
    togglePhotoField,
    toggleFieldCaveat,
    moveField,
    managedHoursIndex,
    managedWebsiteIndex,
    managedPhotoIndex,
  } = useCategoryFieldEditing(initial)

  const { saving, errors, pendingCleanup, pendingRename, save, cancelCleanup, cancelRename } = useCategorySaveWorkflow({
    draft,
    initial,
    isNew,
    token,
    onSaved,
  })

  // Preview gets its own history entry so browser/trackpad Back (and the
  // preview's own Up button, which calls closePreview) land back on this
  // editor instead of skipping past it to the category list.
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      setPreviewing(!!(e.state as { editorPreview?: boolean } | null)?.editorPreview)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function openPreview() {
    setPreviewing(true)
    history.pushState({ ...(window.history.state ?? {}), editorPreview: true }, '')
  }

  function closePreview() {
    history.back()
  }

  if (previewing) {
    // A throwaway config built from the in-progress draft (never saved) — lets
    // the admin see the real directory page (listings, buttons, Add/Edit/
    // Report forms) update live as they edit fields.
    const previewCategory: CategoryConfig = {
      id: initial?.id ?? 'preview',
      label: draft.label || 'Listing',
      pluralLabel: draft.pluralLabel || draft.label || 'Preview',
      icon: draft.icon.trim() || DEFAULT_CATEGORY_ICON,
      iconImageUrl: draft.iconImageUrl.trim() || null,
      description: draft.description,
      detailFields: mergeFieldsWithHidden(draft.fields.map(normalizeField), draft.hiddenFields),
      kind: 'listing',
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
    }
    return <CategoryPreview category={previewCategory} onClose={closePreview} />
  }

  return (
    <div>
      <button
        onClick={onCancel}
        className="text-sm text-muted hover:text-slate-700 underline mb-4 cursor-pointer"
      >
        ← Back to categories
      </button>

      <h2 className="text-lg font-semibold text-slate-900 mb-4">
        {isNew ? 'New category' : `Edit “${initial!.pluralLabel}”`}
        {!isNew && <span className="ml-2 text-xs font-normal text-muted">{initial!.id}</span>}
      </h2>

      <div className="space-y-6">
        {isNew && CATEGORY_TEMPLATES.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
            <span className="block text-xs font-medium text-slate-700">Start from a template (optional)</span>
            {/* Compact chips rather than a card per template — hover (or a
                screen reader's accessible name) surfaces what makes each
                template's shape distinctive via `title`, so the list can grow
                without eating the whole screen. Stays visible after applying
                one (rather than disappearing once fields exist) so trying a
                different shape is just another click. */}
            <div className="flex flex-wrap gap-2">
              {CATEGORY_TEMPLATES.map((t) => {
                const active = lastAppliedTemplate?.id === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.id)}
                    title={t.description}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border border-primary bg-primary/5 text-primary'
                        : 'border border-slate-300 text-slate-700 hover:border-primary hover:bg-primary/5'
                    }`}
                  >
                    {t.icon && <span aria-hidden="true">{t.icon}</span>}
                    {t.label}
                  </button>
                )
              })}
            </div>
            <span className="block text-[11px] text-muted">
              Hover a template to see what makes its shape distinctive. Applying one replaces the
              details below with its fields — everything stays fully editable, and picking a different
              template swaps in that one&rsquo;s fields instead.
            </span>
          </section>
        )}

        {/* Presentation — just the front card itself: what a visitor actually
            sees on the home screen. Icon and Description moved out (below) —
            neither renders on the card once a background photo is set (every
            built-in category has one today), so they belong with the other
            behind-the-scenes settings instead. */}
        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Name *</span>
            <input value={draft.pluralLabel} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Schools" />
            <span className="block text-[11px] text-muted mt-1">
              Plural, as it appears on the card. The singular (for “Add a …”) is derived automatically.
            </span>
          </label>
          <CardBackgroundField
            cardImageUrl={draft.cardImageUrl}
            onCardImageUrl={(v) => set('cardImageUrl', v)}
            cardTextColor={draft.cardTextColor}
            onCardTextColor={(v) => set('cardTextColor', v)}
            previewIcon={draft.icon}
            previewTitle={draft.pluralLabel || 'Category'}
          />
        </section>

        {/* Capabilities */}
        <section className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">What this category shows</h3>
          <p className="text-xs text-muted mb-3">
            Turn an affordance off to hide it (and block that action on the server) for this category
            only. These sit under the site-wide switches — if something is off site-wide, it stays off
            here regardless.
          </p>
          <label className="block mb-3">
            <span className="block text-xs font-medium text-slate-700 mb-1">Description</span>
            <input value={draft.description} onChange={(e) => set('description', e.target.value)} className={inputClass} placeholder="e.g. Kosher and local grocery stores near the hospital" />
            <span className="block text-[11px] text-muted mt-1">
              Not shown to visitors directly — helps this category surface when someone searches for
              a word that&rsquo;s in here but not in the name.
            </span>
          </label>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {CATEGORY_CAPABILITY_KEYS.filter((k) => k !== 'map' || (hasMapCategory && draft.hasAddress)).map((k) => (
              <label key={k} className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={draft.capabilities[k]} onChange={(e) => setCap(k, e.target.checked)} className="rounded border-slate-300" />
                {CAPABILITY_LABELS[k]}
              </label>
            ))}
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={draft.upvotesEnabled} onChange={(e) => set('upvotesEnabled', e.target.checked)} className="rounded border-slate-300" />
              Upvotes
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.externalLinkEnabled}
                onChange={(e) => set('externalLinkEnabled', e.target.checked)}
                className="rounded border-slate-300"
              />
              External link
            </label>
          </div>
          {draft.capabilities.map && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <IconField
                icon={draft.icon}
                onChange={(v) => set('icon', v)}
                iconImageUrl={draft.iconImageUrl}
                onIconImageUrl={(v) => set('iconImageUrl', v)}
                token={token}
              />
              <span className="block text-[11px] text-muted mt-1">
                Used as this category&rsquo;s marker on the map.
              </span>
            </div>
          )}
          {draft.externalLinkEnabled && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={draft.externalLinkLabel}
                  onChange={(e) => set('externalLinkLabel', e.target.value)}
                  className={`${inputClass} sm:w-1/3`}
                  placeholder="Button text, e.g. Other Mikvahs"
                />
                <input
                  value={draft.externalLinkUrl}
                  onChange={(e) => set('externalLinkUrl', e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder="https://…"
                />
              </div>
              <span className="block text-[11px] text-muted">
                Shown as its own button in this category’s directory, next to Map/Add — for pointing
                somewhere broader the site doesn’t curate itself. Not tied to any listing.
              </span>
            </div>
          )}
        </section>

        {/* Details */}
        <section className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-800">Details</h3>
            <div className="flex items-center gap-3">
              {draft.fields.some((f) => f.type === 'boolean') && (
                <button
                  onClick={() => setGroupForm({ audienceKey: '', prefix: '', phone: true, email: true, hours: true, notes: false })}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  + Add audience group
                </button>
              )}
              <button onClick={addField} className="text-xs font-medium text-primary hover:underline cursor-pointer">
                + Add detail
              </button>
            </div>
          </div>
          <p className="text-xs text-muted mb-3">
            What each listing shows, beyond its name, address, and phone.
          </p>

          <div className="pb-4 mb-4 border-b border-slate-100 space-y-1.5">
            <span className="block text-xs font-medium text-slate-700">Every listing also has</span>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.hasAddress}
                onChange={(e) => set('hasAddress', e.target.checked)}
                className="rounded border-slate-300"
              />
              An address
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.hasPhone}
                onChange={(e) => set('hasPhone', e.target.checked)}
                className="rounded border-slate-300"
              />
              A phone number
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.fields.some(isPlainHoursField)}
                onChange={(e) => toggleHoursField(e.target.checked)}
                className="rounded border-slate-300"
              />
              Hours
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.fields.some(isWebsiteField)}
                onChange={(e) => toggleWebsiteField(e.target.checked)}
                className="rounded border-slate-300"
              />
              A website
            </label>
            {managedWebsiteIndex !== -1 && (
              // The website field this checkbox owns doesn't get its own row
              // in the Details list below (see managedWebsiteIndex), so its
              // "show as a button" setting — otherwise only reachable from
              // that row's own FieldEditor — needs a way in from here instead.
              // Stays directly under "A website" (not after Photo below it),
              // same as any checkbox's own sub-option would.
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer ml-6">
                <input
                  type="checkbox"
                  checked={!!draft.fields[managedWebsiteIndex].showInHeader}
                  onChange={(e) => updateField(managedWebsiteIndex, { showInHeader: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Also show it as a button on the collapsed card, before the arrow
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.fields.some(isPhotoField)}
                onChange={(e) => togglePhotoField(e.target.checked)}
                className="rounded border-slate-300"
              />
              A photo
            </label>
            <span className="block text-[11px] text-muted">
              Address and phone are on by default; turn either off for listings that aren’t a physical
              place — like WhatsApp groups — and it disappears from the form and the card. With no
              address, distance sorting and the Map button don’t apply either. Hours and website start
              off — turn one on to add it to every listing below. Photo starts on: each listing can
              upload its own picture on the add/edit form, shown instead of this category’s icon for
              that one listing — turn it off if listings here shouldn’t have their own photo. Address,
              phone, hours, and website fill in automatically from Google when you type the address.
            </span>
          </div>

          {groupForm && (
            <div className="border border-primary/40 rounded-md p-3 mb-3 bg-primary/5 space-y-2.5">
              <p className="text-xs font-medium text-slate-700">
                Add a Phone/Email/Hours/Notes set, all scoped to one filter — e.g. pick &ldquo;Women&rsquo;s
                Tevillah&rdquo; and prefix &ldquo;Women&rsquo;s&rdquo; to add Women&rsquo;s Phone, Women&rsquo;s
                Email, and Women&rsquo;s Hours in one go.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <label className="block sm:w-1/2">
                  <span className="block text-[11px] font-medium text-slate-600 mb-0.5">Which filter</span>
                  <select
                    value={groupForm.audienceKey}
                    onChange={(e) => setGroupForm((g) => (g ? { ...g, audienceKey: e.target.value } : g))}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {draft.fields.filter((f) => f.type === 'boolean').map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block sm:w-1/2">
                  <span className="block text-[11px] font-medium text-slate-600 mb-0.5">Label prefix</span>
                  <input
                    value={groupForm.prefix}
                    onChange={(e) => setGroupForm((g) => (g ? { ...g, prefix: e.target.value } : g))}
                    className={inputClass}
                    placeholder="e.g. Women's"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {([['hours', 'Hours'], ['phone', 'Phone'], ['email', 'Email'], ['notes', 'Notes']] as const).map(([key, lbl]) => (
                  <label key={key} className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={groupForm[key]}
                      onChange={(e) => setGroupForm((g) => (g ? { ...g, [key]: e.target.checked } : g))}
                      className="rounded border-slate-300"
                    />
                    {lbl}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={addAudienceGroup}
                  disabled={!groupForm.audienceKey || !groupForm.prefix.trim()}
                  className="text-xs font-medium bg-primary text-white rounded px-3 py-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Add fields
                </button>
                <button
                  onClick={() => setGroupForm(null)}
                  className="text-xs font-medium border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {draft.fields.filter((_, i) => i !== managedHoursIndex && i !== managedWebsiteIndex && i !== managedPhotoIndex).length === 0 ? (
            <p className="text-xs text-muted">No details yet — listings will show just name, address, and phone.</p>
          ) : (
            <div className="space-y-3">
              {draft.fields.map((f, i) => {
                // The one Hours/Website/Photo field each checkbox above
                // actually owns doesn't get a row here — same as
                // address/phone, checking the box is the whole interaction,
                // nothing left to configure per-listing. A second field that
                // happens to match the same shape (see managedHoursIndex/
                // managedWebsiteIndex/managedPhotoIndex above) is NOT this
                // checkbox's — it still gets a normal, editable row below.
                if (i === managedHoursIndex || i === managedWebsiteIndex || i === managedPhotoIndex) return null
                return (
                <FieldEditor
                  key={i}
                  field={f}
                  index={i}
                  total={draft.fields.length}
                  // "Required" only matters if people can add or edit listings.
                  canRequire={draft.capabilities.add || draft.capabilities.edit}
                  // Boolean fields make sense as an "audience" a field is
                  // scoped to (e.g. "Women's Tevillah") — a field can't be
                  // scoped to itself.
                  audienceOptions={draft.fields
                    .filter((other) => other.type === 'boolean' && other.key !== f.key)
                    .map((other) => ({ key: other.key, label: other.label }))}
                  // Choice fields make sense as a "show only when this equals
                  // that option" trigger (e.g. "Out of Town Deliveries" on a
                  // multiSelect Type field) — a field can't be scoped to itself.
                  showIfOptions={draft.fields
                    .filter((other) => other.type === 'select' && other.key !== f.key)
                    .map((other) => ({ key: other.key, label: other.label, options: other.options ?? [] }))}
                  onChange={(patch) => updateField(i, patch)}
                  onRemove={() => removeField(i)}
                  onMove={(dir) => moveField(i, dir)}
                  hasCaveat={!!f.caveat}
                  onToggleCaveat={(on) => toggleFieldCaveat(i, on)}
                />
                )
              })}
            </div>
          )}
        </section>

        {errors.length > 0 && (
          <ul className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 list-disc list-inside space-y-0.5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}

        {pendingRename ? (
          <RenameConfirm
            rename={pendingRename}
            saving={saving}
            onCancel={cancelRename}
            onConfirm={() => save()}
            onSkip={() => save({ skipRename: true })}
          />
        ) : pendingCleanup ? (
          <CleanupConfirm
            cleanup={pendingCleanup}
            initial={initial}
            saving={saving}
            onCancel={cancelCleanup}
            onConfirm={() => save()}
          />
        ) : (
          <div className="flex gap-2">
            <button
              onClick={openPreview}
              className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Preview
            </button>
            <button
              onClick={() => save()}
              disabled={saving}
              className="text-sm font-medium bg-primary text-white rounded-md px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving…' : isNew ? 'Create category' : 'Save changes'}
            </button>
            <button
              onClick={onCancel}
              disabled={saving}
              className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
