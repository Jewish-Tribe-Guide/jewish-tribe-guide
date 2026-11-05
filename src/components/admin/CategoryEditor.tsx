'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DEFAULT_CATEGORY_ICON, bandImageFor, type CategoryConfig } from '@/lib/categories'
import { getCategoryColor } from '@/lib/categoryColor'
import { groupByFromKey } from '@/lib/listGroups'
import { questionCardFromKey } from '@/lib/questionCards'
import { walkListFromKey } from '@/lib/walkList'
import { listingPartsToSave } from '@/lib/listingParts'
import { adminBase } from '@/lib/adminNav'
import { useIsDesktop } from '@/lib/useIsMobile'
import CategoryIcon from '@/components/CategoryIcon'
import { ListingPartsEditor, WalkListsEditor } from './ListingPartsEditor'
import CategoryPreview from './CategoryPreview'
import { CardBackgroundField, CardBandImageField, IconField } from './CategoryFormFields'
import { FieldEditor } from './CategoryFieldEditor'
import { CleanupConfirm, RenameConfirm, IdRenameConfirm } from './CategorySaveConfirmations'
import { fieldShows, mergeFieldsWithHidden, normalizeField, toDraft, type Draft } from './categoryEditorLogic'
import { useCategoryFieldEditing } from './useCategoryFieldEditing'
import { useCategorySaveWorkflow } from './useCategorySaveWorkflow'
import { AdminBack, AdminBox, AdminField, AdminPreviewButton, AdminRow, AdminRows, AdminSwitch, AdminYesNo, Chevron, adminInputClass } from './AdminUI'
import DeletePage from './DeletePage'
import FieldPicker, { type FieldPickerScreen } from './FieldPicker'
import { PreviewBeside } from './SitePreview'
import SaveBar, { LEAVE_QUESTION, useLeaveGuard } from './SaveBar'
import { useCommunitySlug } from '@/lib/communityContext'

// One category page's settings (the admin redesign's boards 6 and 6b): its
// kind, name and look, what each place shows (a row per field, each opening
// to its own screen, board "Field"), the map, and the "Not listed here?"
// line, with the page itself beside them on a computer or a phone and one
// Save bar. A new category starts by picking its kind (brief, question 8).

type Props = {
  token: string
  initial: CategoryConfig | null
  /** Every category, only so the pin-colour field can show what "Automatic"
   *  currently resolves to — that fallback is positional, so it can only be
   *  computed against the whole list. Null while they're still loading. */
  siblings: CategoryConfig[] | null
  /** Given the id it was saved under. */
  onSaved: (id: string) => void
  onCancel: () => void
  /** Just saved: the Save bar says so until the next change. */
  justSaved?: boolean
  /** Deleted from its own "Delete this page". */
  onDeleted?: () => void
  /** A new page's ready-made page to start from (board 2). */
  seed?: CategoryConfig | null
  /** Where Back goes: "Category pages", or a new page's "What kind of
   *  places?". */
  backLabel?: string
}

export function CategoryEditor(props: Props) {
  // Undo puts the saved settings back by starting the screen again.
  const [round, setRound] = useState(0)
  return <CategoryEditorScreen key={round} {...props} justSaved={round === 0 && props.justSaved} onUndo={() => setRound((r) => r + 1)} />
}

/** Draft keys that move with another, so one edit counts once: the
 *  singular follows the name, and the map follows the address. */
const FOLLOWING_KEYS = new Set<keyof Draft>(['label', 'capabilities'])

function changedKeys(draft: Draft, saved: Draft): number {
  return (Object.keys(draft) as (keyof Draft)[]).filter((k) => !FOLLOWING_KEYS.has(k) && JSON.stringify(draft[k]) !== JSON.stringify(saved[k])).length
}

function CategoryEditorScreen({
  token,
  initial,
  siblings,
  onSaved,
  onCancel,
  justSaved = false,
  onDeleted,
  seed = null,
  backLabel = 'Category pages',
  onUndo,
}: Props & { onUndo: () => void }) {
  const isNew = initial === null
  const community = useCommunitySlug()
  const [previewing, setPreviewing] = useState(false)
  // The field whose own screen is open (board "Field"), by its place in
  // draft.fields.
  const [openField, setOpenField] = useState<number | null>(null)
  // "+ Add a field"'s screens (boards 7-12), when one is open.
  const [adding, setAdding] = useState<FieldPickerScreen | null>(null)
  // Back from a field or the picker, the Fields box is still open on a phone.
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [placeCount, setPlaceCount] = useState<number | null>(null)
  const wide = useIsDesktop('(max-width: 1023px)')
  // Beside, the page's own preview counts its places; without it (a phone),
  // count them here.
  const countId = !wide && !isNew ? initial.id : null
  useEffect(() => {
    if (!countId) return
    let cancelled = false
    fetch(`/api/resources?category=${encodeURIComponent(countId)}`)
      .then(async (res) => {
        const body = await res.json()
        if (!cancelled && res.ok && body.ok) setPlaceCount((body.resources as unknown[]).length)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [countId])
  // What the positional rule would give this category, previewed under
  // "Automatic". For a category being created there is no id in the list yet,
  // so it lands on the neutral fallback — accurate enough, since its real
  // position isn't known until it's saved.
  const fallbackPinColor = getCategoryColor(siblings, initial?.id ?? '')

  const {
    draft,
    groupForm,
    setGroupForm,
    set,
    setName,
    setCap,
    updateField,
    addReadyField,
    addOwnField,
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
  } = useCategoryFieldEditing(initial, seed)

  const { saving, errors, pendingCleanup, pendingRename, pendingIdRename, save, cancelCleanup, cancelRename, cancelIdRename } = useCategorySaveWorkflow({
    draft,
    initial,
    isNew,
    token,
    community,
    onSaved,
  })

  // A new category's bar always shows, to create it; leaving asks only once
  // something's been filled in.
  const changes = isNew ? 1 : changedKeys(draft, toDraft(initial))
  const dirty = isNew ? changedKeys(draft, toDraft(seed)) > 0 : changes > 0
  useLeaveGuard(dirty)

  // The preview and a field's screen each get their own history entry, so
  // browser/trackpad Back (and the preview's own Up button, which calls
  // history.back) land back on this screen instead of skipping past it to
  // the category list.
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const state = e.state as { editorPreview?: boolean; editorField?: number; editorAdd?: FieldPickerScreen } | null
      setPreviewing(!!state?.editorPreview)
      setOpenField(state?.editorField ?? null)
      setAdding(state?.editorAdd ?? null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function openPreview() {
    setPreviewing(true)
    history.pushState({ ...(window.history.state ?? {}), editorPreview: true }, '')
  }

  function showField(i: number) {
    setFieldsOpen(true)
    setOpenField(i)
    history.pushState({ ...(window.history.state ?? {}), editorField: i }, '')
    window.scrollTo?.(0, 0)
  }

  function showAdding(next: FieldPickerScreen) {
    setFieldsOpen(true)
    setAdding(next)
    history.pushState({ ...(window.history.state ?? {}), editorAdd: next }, '')
    window.scrollTo?.(0, 0)
  }

  // Added: back to the page, past the picker's screens (the list, and the
  // field looked at or the kind picked). Make your own opens the new
  // field's screen, to name it.
  function added(i: number | null) {
    const back = adding?.at === 'list' ? 1 : 2
    const after = () => {
      window.removeEventListener('popstate', after)
      if (i !== null) showField(i)
    }
    window.addEventListener('popstate', after)
    history.go(-back)
  }

  function leave() {
    if (dirty && !window.confirm(LEAVE_QUESTION)) return
    onCancel()
  }

  // A throwaway config built from the in-progress draft (never saved) — lets
  // the admin see the real category page (listings, buttons, Add/Edit/
  // Report forms) update live as they edit.
  const previewCategory: CategoryConfig = {
    id: initial?.id ?? 'preview',
    label: draft.label || 'Listing',
    pluralLabel: draft.pluralLabel || draft.label || 'Preview',
    ...(draft.placeKind && { placeKind: draft.placeKind }),
    icon: draft.icon.trim() || DEFAULT_CATEGORY_ICON,
    iconImageUrl: draft.iconImageUrl.trim() || null,
    description: draft.description,
    detailFields: mergeFieldsWithHidden(draft.fields.map(normalizeField), draft.hiddenFields),
    kind: 'listing',
    hasAddress: draft.hasAddress,
    hasPhone: draft.hasPhone,
    upvotesEnabled: draft.upvotesEnabled,
    capabilities: draft.capabilities,
    groupBy: groupByFromKey(draft.groupBy),
    questionCard: questionCardFromKey(draft.questionCard),
    walkList: walkListFromKey(draft.walkList),
    listingParts: listingPartsToSave(draft.listingParts) ?? undefined,
    externalLink:
      draft.externalLinkEnabled && draft.externalLinkLabel.trim() && draft.externalLinkUrl.trim()
        ? { label: draft.externalLinkLabel.trim(), url: draft.externalLinkUrl.trim() }
        : null,
    cardImageUrl: draft.cardImageUrl.trim() || null,
    cardBandImageUrl: draft.cardBandImageUrl.trim() || null,
    pinColor: draft.pinColor || null,
  }

  if (previewing) return <CategoryPreview category={previewCategory} onClose={() => history.back()} />

  const name = draft.pluralLabel.trim() || (isNew ? 'New category page' : initial!.pluralLabel)
  const pinColor = draft.pinColor || fallbackPinColor
  const field = openField !== null ? draft.fields[openField] : undefined

  // The page beside the settings, on a computer only: there's no room on
  // anything narrower. Clicking it opens it full size, to try.
  const preview = wide && (
    <aside aria-label="Preview" className="shrink-0 sticky top-8 self-start">
      <PreviewBeside onOpen={openPreview}>{() => <CategoryPreview inline category={previewCategory} onClose={() => {}} onListings={setPlaceCount} />}</PreviewBeside>
    </aside>
  )

  let screen: React.ReactNode
  if (adding) {
    screen = (
      <FieldPicker
        token={token}
        pageName={name}
        pageLabel={draft.label}
        page={{ hasAddress: draft.hasAddress, hasPhone: draft.hasPhone, fields: draft.fields }}
        screen={adding}
        onScreen={showAdding}
        onBack={() => history.back()}
        onAdd={(row) => {
          if (row.basic === 'address') {
            set('hasAddress', true)
            setCap('map', true)
          } else if (row.basic === 'phone') set('hasPhone', true)
          else if (row.basic === 'hours') toggleHoursField(true)
          else if (row.basic === 'website') toggleWebsiteField(true)
          else if (row.field) addReadyField(row.field, row.companions)
          added(null)
        }}
        onMakeOwn={(type, label) => added(addOwnField(type, label))}
      />
    )
  } else if (field && openField !== null) {
    // A field's own screen (board "Field").
    const i = openField
    screen = (
      <>
        <AdminBack back={{ label: name, onClick: () => history.back() }} title={field.label || 'New field'} />
        <p className="m-0 -mt-3 text-[15px] text-slate-600 max-md:mt-0">A field on {name}</p>
        <FieldEditor
          field={field}
          index={i}
          total={draft.fields.length}
          // "Required" only matters if people can add or edit listings.
          canRequire={draft.capabilities.add || draft.capabilities.edit}
          // Boolean fields make sense as an "audience" a field is scoped to
          // (e.g. "Women's Tevillah") — a field can't be scoped to itself.
          audienceOptions={draft.fields
            .filter((other) => other.type === 'boolean' && other.key !== field.key)
            .map((other) => ({ key: other.key, label: other.label }))}
          // Choice fields make sense as a "show only when this equals that
          // option" trigger — a field can't be scoped to itself.
          showIfOptions={draft.fields
            .filter((other) => other.type === 'select' && other.key !== field.key)
            .map((other) => ({ key: other.key, label: other.label, options: other.options ?? [] }))}
          // Yes/No and Choice fields are the ones that can render as a badge
          // — a field can't replace its own badge.
          badgeFieldOptions={draft.fields
            .filter((other) => (other.type === 'boolean' || other.type === 'select') && other.key !== field.key)
            .map((other) => ({ key: other.key, label: other.label }))}
          // Words a link's own box could say (CategoryField.leadBox).
          textFieldOptions={draft.fields
            .filter((other) => (other.type === 'textarea' || other.type === 'text') && other.key !== field.key)
            .map((other) => ({ key: other.key, label: other.label }))}
          onChange={(patch) => updateField(i, patch)}
          onRemove={() => {
            removeField(i)
            history.back()
          }}
          onMove={(dir) => {
            moveField(i, dir)
            setOpenField(i + dir)
            history.replaceState({ ...(window.history.state ?? {}), editorField: i + dir }, '')
          }}
          hasCaveat={!!field.caveat}
          onToggleCaveat={(on) => toggleFieldCaveat(i, on)}
        />
      </>
    )
  } else {
    const rows = draft.fields
      .map((f, i) => ({ f, i }))
      // The one Hours/Website/Photo field each "Every place has" box owns
      // doesn't get a row — like address and phone, the box is the whole
      // thing. A second field of the same shape is not the box's, and keeps
      // its row.
      .filter(({ i }) => i !== managedHoursIndex && i !== managedWebsiteIndex && i !== managedPhotoIndex)

    screen = (
      <>
        <AdminBack back={{ label: backLabel, onClick: leave }} title={name} />
        {/* On a phone the page beside has no room: Preview opens it full
            size (board 21b). */}
        {!wide && (
          <AdminPreviewButton onClick={openPreview} />
        )}
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-[10px] px-4 py-2.5 min-h-[52px] md:-mt-3 md:bg-transparent md:border-0 md:p-0 md:min-h-0">
          {/* A phone: "On the site" over the count, the switch on the right
              (board 21b). A computer: the count, then the switch and its
              words. */}
          <span className="flex-1 min-w-0 flex flex-col gap-px">
            <span aria-hidden="true" className="md:hidden text-[15px] font-semibold text-slate-900">On the site</span>
            {!isNew && placeCount !== null && (
              <Link
                href={`${adminBase(community)}/places?category=${encodeURIComponent(initial!.id)}`}
                className="self-start text-[13px] text-slate-600 md:text-sm md:font-semibold md:text-primary hover:underline"
              >
                {placeCount} {placeCount === 1 ? 'place' : 'places'}
              </Link>
            )}
          </span>
          <span className="flex items-center gap-2.5 text-[15px] font-semibold text-slate-900">
            <span aria-hidden="true" className="max-md:hidden md:order-last">On the site</span>
            <AdminSwitch checked={draft.active} onChange={(on) => set('active', on)} label="On the site" />
          </span>
        </div>


        <AdminBox title="Basics" foldOnPhone summary={`${draft.pluralLabel || 'No name'} · ${bandImageFor(previewCategory) ? 'Banner photo' : 'No banner photo'}`}>
          <Basics
            name={draft.pluralLabel}
            onName={setName}
            icon={
              <CategoryIcon
                icon={draft.icon || DEFAULT_CATEGORY_ICON}
                categoryId={initial?.id}
                iconImageUrl={draft.iconImageUrl.trim() || undefined}
                color={pinColor}
                className="h-11 w-11 text-2xl"
                sizePx={44}
              />
            }
            iconFields={<IconField icon={draft.icon} onChange={(v) => set('icon', v)} iconImageUrl={draft.iconImageUrl} onIconImageUrl={(v) => set('iconImageUrl', v)} token={token} />}
            banner={bandImageFor(previewCategory)}
            bannerFields={
              <>
                <CardBandImageField
                  cardBandImageUrl={draft.cardBandImageUrl}
                  onCardBandImageUrl={(v) => set('cardBandImageUrl', v)}
                  fallbackImageUrl={draft.cardImageUrl}
                  previewIcon={draft.icon}
                  previewColor={pinColor}
                  token={token}
                />
                <CardBackgroundField cardImageUrl={draft.cardImageUrl} onCardImageUrl={(v) => set('cardImageUrl', v)} />
              </>
            }
          />
        </AdminBox>

        <AdminBox
          title="Fields"
          foldOnPhone
          defaultOpen={fieldsOpen}
          summary={fieldsSummary([draft.hasAddress ? 'Address' : '', draft.hasPhone ? 'Phone' : '', ...rows.map(({ f }) => normalizeField(f).label)])}
          action={
            <span className="flex items-center gap-4">
              {draft.fields.some((f) => f.type === 'boolean') && (
                <button
                  type="button"
                  onClick={() => setGroupForm({ audienceKey: '', prefix: '', phone: true, email: true, hours: true, notes: false })}
                  className="min-h-11 text-sm font-semibold text-primary hover:underline cursor-pointer"
                >
                  + Add audience group
                </button>
              )}
              <button
                type="button"
                onClick={() => showAdding({ at: 'list' })}
                className="min-h-11 text-sm font-semibold text-primary hover:underline cursor-pointer"
              >
                + Add a field
              </button>
            </span>
          }
        >
          <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-b border-slate-100">
            <legend className="float-left mr-1 text-[13px] font-semibold text-slate-700">Every place has</legend>
            <Check
              label="An address"
              checked={draft.hasAddress}
              onChange={(on) => {
                set('hasAddress', on)
                // A page is on the map when its places have an address.
                setCap('map', on)
              }}
            />
            <Check label="A phone number" checked={draft.hasPhone} onChange={(on) => set('hasPhone', on)} />
            <Check label="Hours" checked={draft.fields.some(isPlainHoursField)} onChange={toggleHoursField} />
            <Check label="A website" checked={draft.fields.some(isWebsiteField)} onChange={toggleWebsiteField} />
            {managedWebsiteIndex !== -1 && (
              // The website field that box owns has no row, so its "show as
              // a button" setting needs a way in from here.
              <Check
                label="Website as a button on the row"
                checked={!!draft.fields[managedWebsiteIndex].showInHeader}
                onChange={(on) => updateField(managedWebsiteIndex, { showInHeader: on })}
              />
            )}
            <Check label="A photo" checked={draft.fields.some(isPhotoField)} onChange={togglePhotoField} />
          </fieldset>

          {groupForm && (
            <div className="flex flex-col gap-3 p-4 border-b border-slate-100 bg-blue-50/50">
              <div className="grid sm:grid-cols-2 gap-3">
                <AdminField label="Which filter">
                  <select value={groupForm.audienceKey} onChange={(e) => setGroupForm((g) => (g ? { ...g, audienceKey: e.target.value } : g))} className={adminInputClass}>
                    <option value="">Select…</option>
                    {draft.fields.filter((f) => f.type === 'boolean').map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </AdminField>
                <AdminField label="Label prefix">
                  <input value={groupForm.prefix} onChange={(e) => setGroupForm((g) => (g ? { ...g, prefix: e.target.value } : g))} className={adminInputClass} placeholder="e.g. Women's" />
                </AdminField>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {([['hours', 'Hours'], ['phone', 'Phone'], ['email', 'Email'], ['notes', 'Notes']] as const).map(([key, lbl]) => (
                  <Check key={key} label={lbl} checked={groupForm[key]} onChange={(on) => setGroupForm((g) => (g ? { ...g, [key]: on } : g))} />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addAudienceGroup}
                  disabled={!groupForm.audienceKey || !groupForm.prefix.trim()}
                  className="min-h-11 px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                >
                  Add fields
                </button>
                <button type="button" onClick={() => setGroupForm(null)} className="min-h-11 px-4 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 hover:bg-slate-50 cursor-pointer">
                  Leave it
                </button>
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="m-0 px-4 py-3 text-[15px] text-slate-600">Just a name, address and phone.</p>
          ) : (
            <AdminRows items={rows} shown={8}>
              {({ f, i }) => <AdminRow key={i} onClick={() => showField(i)} name={f.label || 'New field'} line={fieldShows(f)} />}
            </AdminRows>
          )}
        </AdminBox>

        {/* Other categories' places within a walk, and what each opened place
            adds (until a listing's boxes are Fields, step 3). */}
        {!isNew && draft.hasAddress && <WalkListsEditor value={draft.walkList} onChange={(v) => set('walkList', v)} self={initial!} categories={siblings ?? []} />}
        {!isNew && <ListingPartsEditor value={draft.listingParts} onChange={(v) => set('listingParts', v)} fields={draft.fields.map(normalizeField)} />}

        <AdminBox title="Questions" foldOnPhone summary={draft.upvotesEnabled ? 'Upvotes on' : 'Upvotes off'}>
          <AdminYesNo question="Can visitors upvote places?" value={draft.upvotesEnabled} onChange={(yes) => set('upvotesEnabled', yes)} />
          <AdminYesNo question="A link for places not listed here?" value={draft.externalLinkEnabled} onChange={(yes) => set('externalLinkEnabled', yes)} />
          {draft.externalLinkEnabled && (
            <div className="flex flex-col gap-4 p-4 border-t border-slate-100">
              <AdminField label="Words">
                <input
                  value={draft.externalLinkLabel}
                  onChange={(e) => set('externalLinkLabel', e.target.value)}
                  className={adminInputClass}
                  placeholder="Find more kosher food"
                />
              </AdminField>
              <AdminField label="Link">
                <input
                  value={draft.externalLinkUrl}
                  onChange={(e) => set('externalLinkUrl', e.target.value)}
                  className={adminInputClass}
                  placeholder="https://"
                />
              </AdminField>
            </div>
          )}
        </AdminBox>

        {isNew ? (
          <button type="button" onClick={leave} className="self-start min-h-11 px-1 text-[15px] font-semibold text-red-700 hover:underline cursor-pointer">
            Don&rsquo;t make this page
          </button>
        ) : (
          onDeleted && <DeletePage token={token} category={initial!} onDeleted={onDeleted} />
        )}
      </>
    )
  }

  return (
    <div>
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {screen}

          {errors.length > 0 && (
            <ul className="bg-red-50 border border-red-200 rounded-[10px] p-3 text-sm text-red-700 list-disc list-inside space-y-0.5">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}

          {pendingIdRename ? (
            <IdRenameConfirm rename={pendingIdRename} saving={saving} onCancel={cancelIdRename} onConfirm={() => save()} />
          ) : pendingRename ? (
            <RenameConfirm rename={pendingRename} saving={saving} onCancel={cancelRename} onConfirm={() => save()} onSkip={() => save({ skipRename: true })} />
          ) : pendingCleanup ? (
            <CleanupConfirm cleanup={pendingCleanup} initial={initial} saving={saving} onCancel={cancelCleanup} onConfirm={() => save()} />
          ) : null}
        </div>
        {preview}
      </div>

      {!(pendingIdRename || pendingRename || pendingCleanup) && (
        <SaveBar
          changes={changes}
          saving={saving}
          saved={justSaved && changes === 0}
          onUndo={isNew ? leave : onUndo}
          onSave={() => save()}
          {...(isNew && { status: 'Not saved yet', saveLabel: 'Create category', undoLabel: 'Throw away' })}
        />
      )}
    </div>
  )
}

/** "Address, Phone, Hours and 3 more" under the folded Fields row. */
export function fieldsSummary(labels: string[]): string {
  const named = labels.filter(Boolean)
  if (named.length === 0) return 'No fields yet'
  if (named.length <= 3) return named.join(', ')
  return `${named.slice(0, 3).join(', ')} and ${named.length - 3} more`
}

/** A page's Basics (board 4): its icon beside its name, each opening its
 *  settings in place, then the banner photo as a row. */
function Basics({
  name,
  onName,
  icon,
  iconFields,
  banner,
  bannerFields,
}: {
  name: string
  onName: (name: string) => void
  icon: React.ReactNode
  iconFields: React.ReactNode
  banner: string | null
  bannerFields: React.ReactNode
}) {
  const [open, setOpen] = useState<'icon' | 'banner' | null>(null)
  const flip = (which: 'icon' | 'banner') => setOpen((o) => (o === which ? null : which))
  return (
    <>
      <div className="flex flex-col gap-3 p-4 border-b border-slate-100">
        <div className="flex items-end gap-3">
          <span className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-700">Icon</span>
            <button type="button" aria-expanded={open === 'icon'} aria-label="Change the icon" onClick={() => flip('icon')} className="rounded-[10px] cursor-pointer">
              {icon}
            </button>
          </span>
          <span className="flex-1 min-w-0">
            <AdminField label="Name">
              <input value={name} onChange={(e) => onName(e.target.value)} className={adminInputClass} placeholder="Name" />
            </AdminField>
          </span>
        </div>
        {open === 'icon' && <div className="flex flex-col gap-3">{iconFields}</div>}
      </div>
      <button
        type="button"
        aria-expanded={open === 'banner'}
        onClick={() => flip('banner')}
        className="w-full flex items-center gap-3 px-4 py-2.5 min-h-[60px] text-left cursor-pointer hover:bg-slate-50"
      >
        <span className="flex-1 text-[15px] font-semibold text-slate-900">Banner photo</span>
        <BannerThumb url={banner} />
        <span className={open === 'banner' ? 'rotate-90' : ''}>
          <Chevron />
        </span>
      </button>
      {open === 'banner' && <div className="flex flex-col gap-3 px-4 pb-4">{bannerFields}</div>}
    </>
  )
}

function BannerThumb({ url }: { url: string | null }) {
  // A photo that may have been uploaded seconds ago: see ImageUploadField's
  // own note on not optimising it.
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-9 w-[72px] rounded-md object-cover" />
  ) : (
    <span className="grid h-9 w-[72px] place-items-center rounded-md bg-slate-200 text-xs font-semibold text-slate-600">None</span>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 min-h-8 text-[15px] text-slate-900 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
      {label}
    </label>
  )
}
