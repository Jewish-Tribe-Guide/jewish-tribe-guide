'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CATEGORY_CAPABILITY_KEYS, DEFAULT_CATEGORY_ICON, bandImageFor, type CategoryConfig } from '@/lib/categories'
import { getCategoryColor } from '@/lib/categoryColor'
import { groupByFromKey, groupByKey, groupByOptions } from '@/lib/listGroups'
import { questionCardFromKey, questionCardKey, questionCardOptions } from '@/lib/questionCards'
import { walkListFromKey } from '@/lib/walkList'
import { listingPartsToSave } from '@/lib/listingParts'
import { PLACE_KINDS, PLACE_KIND_INFO } from '@/lib/placeKinds'
import { adminBase } from '@/lib/adminNav'
import { useIsDesktop } from '@/lib/useIsMobile'
import CategoryIcon from '@/components/CategoryIcon'
import { ListingPartsEditor, WalkListsEditor } from './ListingPartsEditor'
import CategoryPreview from './CategoryPreview'
import { CardBackgroundField, CardBandImageField, IconField, PinColorField } from './CategoryFormFields'
import { FieldEditor } from './CategoryFieldEditor'
import { CleanupConfirm, RenameConfirm, IdRenameConfirm } from './CategorySaveConfirmations'
import { CAPABILITY_LABELS, fieldShows, mergeFieldsWithHidden, normalizeField, toDraft, type Draft } from './categoryEditorLogic'
import { useCategoryFieldEditing } from './useCategoryFieldEditing'
import { useCategorySaveWorkflow } from './useCategorySaveWorkflow'
import { AdminBox, AdminField, AdminRow, AdminRows, AdminSwitch, adminInputClass } from './AdminUI'
import { PreviewBeside } from './SitePreview'
import SaveBar, { LEAVE_QUESTION, useLeaveGuard } from './SaveBar'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'

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
  /** Whether a Map pseudo-category currently exists — the map switch only
   *  makes sense (and is only offered) when there's a map for it to send
   *  this category's places to. */
  hasMapCategory: boolean
  /** Given the id it was saved under. */
  onSaved: (id: string) => void
  onCancel: () => void
  /** Just saved: the Save bar says so until the next change. */
  justSaved?: boolean
}

export function CategoryEditor(props: Props) {
  // Undo puts the saved settings back by starting the screen again.
  const [round, setRound] = useState(0)
  return <CategoryEditorScreen key={round} {...props} justSaved={round === 0 && props.justSaved} onUndo={() => setRound((r) => r + 1)} />
}

/** Draft keys that move with another, so one edit counts once: the
 *  singular follows the name, and the "Not listed here?" line is on when
 *  both its boxes are filled. */
const FOLLOWING_KEYS = new Set<keyof Draft>(['label', 'externalLinkEnabled'])

function changedKeys(draft: Draft, saved: Draft): number {
  return (Object.keys(draft) as (keyof Draft)[]).filter((k) => !FOLLOWING_KEYS.has(k) && JSON.stringify(draft[k]) !== JSON.stringify(saved[k])).length
}

function CategoryEditorScreen({
  token,
  initial,
  siblings,
  hasMapCategory,
  onSaved,
  onCancel,
  justSaved = false,
  onUndo,
}: Props & { onUndo: () => void }) {
  const isNew = initial === null
  const community = useCommunitySlug()
  const [previewing, setPreviewing] = useState(false)
  // The field whose own screen is open (board "Field"), by its place in
  // draft.fields.
  const [openField, setOpenField] = useState<number | null>(null)
  const [placeCount, setPlaceCount] = useState<number | null>(null)
  const wide = useIsDesktop('(max-width: 1023px)')
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
    setId,
    setCap,
    pickKind,
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
  const dirty = isNew ? changedKeys(draft, toDraft(null)) > 0 : changes > 0
  useLeaveGuard(dirty)

  // The preview and a field's screen each get their own history entry, so
  // browser/trackpad Back (and the preview's own Up button, which calls
  // history.back) land back on this screen instead of skipping past it to
  // the category list.
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const state = e.state as { editorPreview?: boolean; editorField?: number } | null
      setPreviewing(!!state?.editorPreview)
      setOpenField(state?.editorField ?? null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function openPreview() {
    setPreviewing(true)
    history.pushState({ ...(window.history.state ?? {}), editorPreview: true }, '')
  }

  function showField(i: number) {
    setOpenField(i)
    history.pushState({ ...(window.history.state ?? {}), editorField: i }, '')
    window.scrollTo?.(0, 0)
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
      draft.externalLinkLabel.trim() && draft.externalLinkUrl.trim()
        ? { label: draft.externalLinkLabel.trim(), url: draft.externalLinkUrl.trim() }
        : null,
    cardImageUrl: draft.cardImageUrl.trim() || null,
    cardBandImageUrl: draft.cardBandImageUrl.trim() || null,
    pinColor: draft.pinColor || null,
  }

  if (previewing) return <CategoryPreview category={previewCategory} onClose={() => history.back()} />

  const name = draft.pluralLabel.trim() || (isNew ? 'New category' : initial!.pluralLabel)
  const pinColor = draft.pinColor || fallbackPinColor
  const field = openField !== null ? draft.fields[openField] : undefined

  // The page beside the settings, on a computer only: there's no room on
  // anything narrower. Clicking it opens it full size, to try.
  const preview = wide && (
    <aside aria-label="Preview" className="shrink-0 sticky top-8 self-start">
      <PreviewBeside onOpen={openPreview}>{() => <CategoryPreview inline category={previewCategory} onClose={() => {}} onListings={setPlaceCount} />}</PreviewBeside>
    </aside>
  )

  const backLink = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="self-start inline-flex items-center min-h-11 -mt-3 text-sm font-semibold text-primary cursor-pointer">
      ‹ {label}
    </button>
  )

  let screen: React.ReactNode
  if (field && openField !== null) {
    // A field's own screen (board "Field").
    const i = openField
    screen = (
      <>
        {backLink(name, () => history.back())}
        <header>
          <h2 className="m-0 text-[26px] font-bold text-slate-900">{field.label || 'New field'}</h2>
          <p className="m-0 text-[15px] text-slate-600">A field on {name}</p>
        </header>
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
    const kind = draft.placeKind ? PLACE_KIND_INFO[draft.placeKind] : null

    screen = (
      <>
        {backLink('Category pages', leave)}
        <header className="flex items-start gap-4">
          <span className="flex-1 min-w-0 flex flex-col">
            <h2 className="m-0 text-[26px] font-bold text-slate-900">{name}</h2>
            {!isNew && placeCount !== null && (
              <Link href={`${adminBase(community)}/places?category=${encodeURIComponent(initial!.id)}`} className="self-start text-sm font-semibold text-primary hover:underline">
                {placeCount} {placeCount === 1 ? 'place' : 'places'}
              </Link>
            )}
          </span>
          <span className="flex items-center gap-2.5 text-[15px] font-semibold text-slate-900">
            <AdminSwitch checked={draft.active} onChange={(on) => set('active', on)} label="On the site" />
            <span aria-hidden="true">On the site</span>
          </span>
        </header>

        {isNew ? (
          <AdminBox title="What kind of places?">
            <div role="radiogroup" aria-label="What kind of places?">
              {PLACE_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={draft.placeKind === k}
                  onClick={() => pickKind(k)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 min-h-[52px] border-b border-slate-100 last:border-b-0 text-left cursor-pointer ${
                    draft.placeKind === k ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${draft.placeKind === k ? 'border-primary bg-primary shadow-[inset_0_0_0_3px_white]' : 'border-slate-400'}`} />
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold text-slate-900">{PLACE_KIND_INFO[k].label}</span>
                    <span className="text-[13px] text-slate-600">{PLACE_KIND_INFO[k].line}</span>
                  </span>
                </button>
              ))}
            </div>
          </AdminBox>
        ) : (
          kind && (
            <section aria-label="Kind" className="bg-white border border-slate-200 rounded-[10px] px-4 py-3.5">
              <p className="m-0 text-[13px] text-slate-600">Kind</p>
              <p className="m-0 text-[15px] font-semibold text-slate-900">{kind.label}</p>
              <p className="m-0 text-[13px] text-slate-600">{kind.line}</p>
            </section>
          )
        )}

        <AdminBox title="Name and look">
          <div className="flex flex-col gap-4 p-4">
            <AdminField label="Name">
              <input value={draft.pluralLabel} onChange={(e) => setName(e.target.value)} className={adminInputClass} placeholder="e.g. Schools" />
            </AdminField>
            <AdminField label="In link previews">
              <input value={draft.description} onChange={(e) => set('description', e.target.value)} className={adminInputClass} />
            </AdminField>
            <div>
              <AdminField label="Web address">
                <input value={draft.id} onChange={(e) => setId(e.target.value)} className={adminInputClass} />
              </AdminField>
              <span className="block mt-1 text-[13px] text-slate-600">{routes.slug(community, draft.id || '…')}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <ChangeRow
                label="Icon"
                look={
                  <CategoryIcon
                    icon={draft.icon || DEFAULT_CATEGORY_ICON}
                    categoryId={initial?.id}
                    iconImageUrl={draft.iconImageUrl.trim() || undefined}
                    color={pinColor}
                    className="h-11 w-11 text-2xl"
                    sizePx={44}
                  />
                }
              >
                <IconField icon={draft.icon} onChange={(v) => set('icon', v)} iconImageUrl={draft.iconImageUrl} onIconImageUrl={(v) => set('iconImageUrl', v)} token={token} />
              </ChangeRow>
              <ChangeRow label="Banner photo" look={<BannerThumb url={bandImageFor(previewCategory)} />}>
                <CardBandImageField
                  cardBandImageUrl={draft.cardBandImageUrl}
                  onCardBandImageUrl={(v) => set('cardBandImageUrl', v)}
                  fallbackImageUrl={draft.cardImageUrl}
                  previewIcon={draft.icon}
                  previewColor={pinColor}
                  token={token}
                />
                <CardBackgroundField cardImageUrl={draft.cardImageUrl} onCardImageUrl={(v) => set('cardImageUrl', v)} />
              </ChangeRow>
            </div>
          </div>
        </AdminBox>

        <AdminBox
          title="What each place shows"
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
                onClick={() => {
                  addField()
                  showField(draft.fields.length)
                }}
                className="min-h-11 text-sm font-semibold text-primary hover:underline cursor-pointer"
              >
                + Add a field
              </button>
            </span>
          }
        >
          <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-b border-slate-100">
            <legend className="float-left mr-1 text-[13px] font-semibold text-slate-700">Every place has</legend>
            <Check label="An address" checked={draft.hasAddress} onChange={(on) => set('hasAddress', on)} />
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

        <AdminBox title="Map">
          <div className="flex flex-col gap-4 p-4">
            {hasMapCategory && draft.hasAddress && (
              <label className="flex items-center gap-3 text-[15px] text-slate-900">
                <AdminSwitch checked={draft.capabilities.map} onChange={(on) => setCap('map', on)} label="Map beside the list, and on the site’s map" />
                <span aria-hidden="true">Map beside the list, and on the site&rsquo;s map</span>
              </label>
            )}
            <ChangeRow label="Pin colour" look={<span className="block h-6 w-6 rounded-full" style={{ backgroundColor: pinColor }} />} inline>
              <PinColorField
                value={draft.pinColor}
                onChange={(v) => set('pinColor', v)}
                fallback={fallbackPinColor}
                icon={draft.icon}
                categoryId={initial?.id}
                iconImageUrl={draft.iconImageUrl}
                siblings={siblings}
              />
            </ChangeRow>
          </div>
        </AdminBox>

        <AdminBox title="“Not listed here?” line">
          <div className="flex flex-col gap-4 p-4">
            <AdminField label="Words">
              <input
                value={draft.externalLinkLabel}
                onChange={(e) => {
                  set('externalLinkLabel', e.target.value)
                  set('externalLinkEnabled', !!(e.target.value.trim() && draft.externalLinkUrl.trim()))
                }}
                className={adminInputClass}
                placeholder="Find more kosher food"
              />
            </AdminField>
            <AdminField label="Link">
              <input
                value={draft.externalLinkUrl}
                onChange={(e) => {
                  set('externalLinkUrl', e.target.value)
                  set('externalLinkEnabled', !!(draft.externalLinkLabel.trim() && e.target.value.trim()))
                }}
                className={adminInputClass}
                placeholder="https://"
              />
            </AdminField>
          </div>
        </AdminBox>

        {/* Not on the drawing, kept: how the list is grouped and the one
            question it asks. Only on an existing category: the choices come
            from its saved fields. */}
        {!isNew && (
          <AdminBox title="The list">
            <div className="flex flex-col gap-4 p-4">
              <AdminField label="Group the list">
                <select value={draft.groupBy} onChange={(e) => set('groupBy', e.target.value)} className={adminInputClass}>
                  <option value="">One list, no groups</option>
                  {groupByOptions({ ...initial!, hasAddress: draft.hasAddress, detailFields: draft.fields.map(normalizeField) }).map((o) => (
                    <option key={groupByKey(o.value)} value={groupByKey(o.value)}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="Question card">
                <select value={draft.questionCard} onChange={(e) => set('questionCard', e.target.value)} className={adminInputClass}>
                  <option value="">No question card</option>
                  {questionCardOptions({ ...initial!, detailFields: draft.fields.map(normalizeField) }).map((o) => (
                    <option key={questionCardKey(o.value)} value={questionCardKey(o.value)}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </AdminField>
            </div>
          </AdminBox>
        )}

        {/* Not on the drawing, kept: other categories' places within a walk,
            and what each opened place adds. */}
        {!isNew && draft.hasAddress && <WalkListsEditor value={draft.walkList} onChange={(v) => set('walkList', v)} self={initial!} categories={siblings ?? []} />}
        {!isNew && <ListingPartsEditor value={draft.listingParts} onChange={(v) => set('listingParts', v)} fields={draft.fields.map(normalizeField)} />}

        {/* Not on the drawing, kept: the per-category switches under the
            site-wide ones. */}
        <AdminBox title="What visitors can do">
          {CATEGORY_CAPABILITY_KEYS.filter((k) => k !== 'map').map((k) => (
            <SwitchRow key={k} label={CAPABILITY_LABELS[k]} checked={draft.capabilities[k]} onChange={(on) => setCap(k, on)} />
          ))}
          <SwitchRow label="Upvotes" checked={draft.upvotesEnabled} onChange={(on) => set('upvotesEnabled', on)} />
        </AdminBox>
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

/** Something with a look and a "Change" that opens its settings in place
 *  (board 6b's Icon, Banner photo and Pin colour). */
function ChangeRow({ label, look, inline = false, children }: { label: string; look: React.ReactNode; inline?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const change = (
    <button type="button" aria-expanded={open} aria-label={`${open ? 'Done with' : 'Change'} ${label.toLowerCase()}`} onClick={() => setOpen((o) => !o)} className="self-start min-h-8 text-[15px] font-semibold text-primary hover:underline cursor-pointer">
      {open ? 'Done' : 'Change'}
    </button>
  )
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-3">
        {look}
        {inline ? (
          <>
            <span className="text-[15px] text-slate-900">{label}</span>
            {change}
          </>
        ) : (
          <span className="flex flex-col">
            <span className="text-[13px] font-semibold text-slate-700">{label}</span>
            {change}
          </span>
        )}
      </div>
      {open && <div className="flex flex-col gap-3">{children}</div>}
    </div>
  )
}

function BannerThumb({ url }: { url: string | null }) {
  // A photo that may have been uploaded seconds ago: see ImageUploadField's
  // own note on not optimising it.
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-11 w-[72px] rounded-md object-cover" />
  ) : (
    <span className="block h-11 w-[72px] rounded-md bg-slate-200" />
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

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 min-h-[52px] border-b border-slate-100 last:border-b-0">
      <span className="flex-1 text-[15px] text-slate-900" aria-hidden="true">
        {label}
      </span>
      <AdminSwitch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}
