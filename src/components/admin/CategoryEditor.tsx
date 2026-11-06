'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { DEFAULT_CATEGORY_ICON, bandImageFor, type CategoryConfig } from '@/lib/categories'
import { getCategoryColor } from '@/lib/categoryColor'
import { groupByFromKey } from '@/lib/listGroups'
import { questionCardFromKey } from '@/lib/questionCards'
import { walkListFromKey } from '@/lib/walkList'
import { listingPartsFromKey, listingPartsKey, listingPartsToSave } from '@/lib/listingParts'
import { addBox, fieldBoxes, removeBox, renameBox, type FieldPage } from '@/lib/fieldBoxes'
import { adminBase } from '@/lib/adminNav'
import { useIsDesktop } from '@/lib/useIsMobile'
import CategoryIcon from '@/components/CategoryIcon'
import FieldBoxes from './FieldBoxes'
import WalkBox from './WalkBox'
import CardBox, { ShowOnLine, type CardLine } from './CardBox'
import { cardPatch, reorderLine, type CardPage } from '@/lib/cardLines'
import CategoryPreview from './CategoryPreview'
import { CardBackgroundField, CardBandImageField, IconField } from './CategoryFormFields'
import { FieldEditor } from './CategoryFieldEditor'
import { CleanupConfirm, RenameConfirm, IdRenameConfirm } from './CategorySaveConfirmations'
import { mergeFieldsWithHidden, normalizeField, toDraft, type Draft } from './categoryEditorLogic'
import { useCategoryFieldEditing } from './useCategoryFieldEditing'
import { useCategorySaveWorkflow } from './useCategorySaveWorkflow'
import { AdminBack, AdminBox, AdminField, AdminPreviewButton, AdminSwitch, AdminYesNo, Chevron, adminInputClass } from './AdminUI'
import { addButton } from './DragList'
import DeletePage from './DeletePage'
import RemoveField, { type Removing } from './RemoveField'
import FieldPicker, { type FieldPickerScreen } from './FieldPicker'
import { PreviewBeside } from './SitePreview'
import SaveBar, { LEAVE_QUESTION, useLeaveGuard } from './SaveBar'
import { useCommunitySlug } from '@/lib/communityContext'

// One category page's settings (the admin redesign's boards 6 and 6b): its
// kind, name and look, what each place shows (a row per field, each opening
// to its own screen, board "Field"), the map, and the "Not listed here?"
// line, with the page itself beside them on a computer or a phone and one
// Save bar. A new category starts by picking its kind (brief, question 8).

/** A field's screen: its place in draft.fields, or the address or phone. */
type OpenField = number | 'address' | 'phone'

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
  // draft.fields, or the page's address or phone.
  const [openField, setOpenField] = useState<OpenField | null>(null)
  // "+ Add a field"'s screens (boards 7-12), when one is open, and the box
  // it was opened from.
  const [adding, setAdding] = useState<FieldPickerScreen | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  // Back from a field or the picker, the Fields box is still open on a phone,
  // with the box it was in (boards 17-19).
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [openBox, setOpenBox] = useState<string | null>(null)
  // A box just added, its name selected to type over (board 19).
  const [freshBox, setFreshBox] = useState<string | null>(null)
  // The fields there were before an add, to find the one added.
  const [landing, setLanding] = useState<ReadonlySet<string> | null>(null)
  // Before it's opened: the line open, and board 23's screen for one.
  const [openLine, setOpenLine] = useState<CardLine | null>(null)
  const [showLine, setShowLine] = useState<'second' | 'third' | null>(null)
  const [placeCount, setPlaceCount] = useState<number | null>(null)
  // "Remove this field" on one places have answered: its own step first
  // (board 16), and the removals answered there, so Save doesn't ask again.
  const [removing, setRemoving] = useState<Removing | null>(null)
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set())
  const counting = useRef(false)
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
    toggleHoursField,
    toggleWebsiteField,
    toggleFieldCaveat,
    moveField,
  } = useCategoryFieldEditing(initial, seed)

  const { saving, errors, pendingCleanup, pendingRename, pendingIdRename, save, countAnswers, cancelCleanup, cancelRename, cancelIdRename } = useCategorySaveWorkflow({
    draft,
    initial,
    isNew,
    token,
    community,
    confirmed,
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
      const state = e.state as {
        editorPreview?: boolean
        editorField?: OpenField
        editorAdd?: FieldPickerScreen
        editorLine?: 'second' | 'third'
        editorRemove?: Removing
      } | null
      setPreviewing(!!state?.editorPreview)
      setOpenField(state?.editorField ?? null)
      setAdding(state?.editorAdd ?? null)
      setShowLine(state?.editorLine ?? null)
      setRemoving(state?.editorRemove ?? null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function openPreview() {
    setPreviewing(true)
    history.pushState({ ...(window.history.state ?? {}), editorPreview: true }, '')
  }

  function showField(i: OpenField) {
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

  const confirmKey = (t: Removing['target']) => (typeof t === 'object' ? `field:${t.field}` : t)

  function takeOff(target: Removing['target']) {
    if (target === 'address') {
      set('hasAddress', false)
      setCap('map', false)
    } else if (target === 'phone') set('hasPhone', false)
    else {
      const i = draft.fields.findIndex((f) => f.key === target.field)
      if (i >= 0) removeField(i)
    }
  }

  // A field only this draft has, or one no place has answered, just goes;
  // otherwise its own step says what goes with it. When the count can't be
  // had, it goes too, and Save asks as it always has.
  async function askRemove(target: Removing['target'], label: string, filter: boolean) {
    const saved =
      !isNew &&
      (target === 'address' ? initial!.hasAddress !== false : target === 'phone' ? initial!.hasPhone !== false : initial!.detailFields.some((f) => f.key === target.field))
    // A second tap while it counts does nothing.
    if (counting.current) return
    counting.current = true
    let count: number | null = 0
    try {
      if (saved) count = await countAnswers(target)
    } finally {
      counting.current = false
    }
    if (!count) {
      // Nothing to lose is answered too; not knowing leaves it to Save.
      setConfirmed((c) => (count === 0 ? new Set(c).add(confirmKey(target)) : new Set([...c].filter((k) => k !== confirmKey(target)))))
      takeOff(target)
      history.back()
      return
    }
    const next: Removing = { target, label, count, filter }
    setRemoving(next)
    history.pushState({ ...(window.history.state ?? {}), editorRemove: next }, '')
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
  const field = typeof openField === 'number' ? draft.fields[openField] : undefined

  // The page beside the settings, on a computer only: there's no room on
  // anything narrower. Clicking it opens it full size, to try.
  const preview = wide && (
    <aside aria-label="Preview" className="shrink-0 sticky top-8 self-start">
      <PreviewBeside onOpen={openPreview}>{() => <CategoryPreview inline category={previewCategory} onClose={() => {}} onListings={setPlaceCount} />}</PreviewBeside>
    </aside>
  )

  // Fields, as the listing's boxes (fieldBoxes.ts). A field not named yet
  // has no key: it goes by its place.
  const pageFields = draft.fields.map((f, i) => ({ ...normalizeField(f), key: f.key || `#${i}` }))
  const draftFieldByKey = new Map(pageFields.map((f, i) => [f.key, draft.fields[i]]))
  const fieldPage: FieldPage = { fields: pageFields, hiddenFields: draft.hiddenFields, hasAddress: draft.hasAddress, hasPhone: draft.hasPhone }
  const parts = listingPartsFromKey(draft.listingParts)
  const boxes = fieldBoxes(fieldPage, parts)
  // Just added: the box it landed in opens, its row there to see.
  if (landing) {
    const key = pageFields.find((f) => !landing.has(f.key))?.key
    const box = key !== undefined && boxes.find((b) => b.fields.includes(key))
    setLanding(null)
    if (box) setOpenBox(box.id)
  }
  // A hechsher's caveat is set on the hechsher's own screen.
  const fieldIndex = (key: string) => {
    const i = pageFields.findIndex((f) => f.key === key)
    return i >= 0 ? i : draft.fields.findIndex((f) => f.caveat && (f.caveat.flagField === key || f.caveat.noteField === key))
  }

  const cardPage: CardPage = { fields: pageFields, hasAddress: draft.hasAddress, upvotes: draft.upvotesEnabled }
  const putOnCard = (key: string, on: boolean) => {
    const i = pageFields.findIndex((f) => f.key === key)
    if (i >= 0) updateField(i, cardPatch(pageFields[i], on))
  }

  let screen: React.ReactNode
  if (removing) {
    screen = (
      <RemoveField
        removing={removing}
        page={name}
        onKeep={() => history.back()}
        onRemove={() => {
          takeOff(removing.target)
          setConfirmed((c) => new Set(c).add(confirmKey(removing.target)))
          // Past the field's screen too, to the page.
          history.go(-2)
        }}
      />
    )
  } else if (showLine) {
    screen = (
      <ShowOnLine
        line={showLine}
        fields={pageFields}
        back={{ label: name, onClick: () => history.back() }}
        onPick={(key) => {
          putOnCard(key, true)
          history.back()
        }}
      />
    )
  } else if (adding) {
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
          if (row.basic === 'address' || row.basic === 'phone') setOpenBox('contact')
          else setLanding(new Set(pageFields.map((f) => f.key)))
          if (row.basic === 'address') {
            set('hasAddress', true)
            setCap('map', true)
          } else if (row.basic === 'phone') set('hasPhone', true)
          else if (row.basic === 'hours') toggleHoursField(true)
          else if (row.basic === 'website') toggleWebsiteField(true)
          else if (row.field) addReadyField(row.field, row.companions, addingTo)
          added(null)
        }}
        onMakeOwn={(type, label) => {
          setLanding(new Set(pageFields.map((f) => f.key)))
          added(addOwnField(type, label, addingTo))
        }}
      />
    )
  } else if (openField === 'address' || openField === 'phone') {
    // The page's address or phone (board 17's Contact): on, or taken off.
    const address = openField === 'address'
    screen = (
      <>
        <AdminBack back={{ label: name, onClick: () => history.back() }} title={address ? 'Address' : 'Phone'} />
        <button
          type="button"
          onClick={() => void askRemove(openField, address ? 'Address' : 'Phone', false)}
          className="self-start min-h-11 px-1 text-[15px] font-semibold text-red-700 hover:underline cursor-pointer"
        >
          Remove this field
        </button>
      </>
    )
  } else if (field && typeof openField === 'number') {
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
            if (field.key) void askRemove({ field: field.key }, field.label || 'New field', !!normalizeField(field).filterable)
            else {
              removeField(i)
              history.back()
            }
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

        <AdminBox title="Fields" foldOnPhone defaultOpen={fieldsOpen} summary={fieldsSummary(boxes.map((b) => b.title))}>
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

          <FieldBoxes
            page={fieldPage}
            boxes={boxes}
            parts={parts}
            openId={openBox}
            freshId={freshBox}
            onOpen={(id) => {
              setOpenBox(id)
              setFreshBox(null)
            }}
            onChange={(next, order) => {
              set('listingParts', listingPartsKey(next))
              if (order) set('fields', order.map((k) => draftFieldByKey.get(k)!))
            }}
            onRename={(id, title) => set('listingParts', listingPartsKey(renameBox(parts, id, title)))}
            onRemoveBox={(id) => {
              set('listingParts', listingPartsKey(removeBox(parts, id)))
              setOpenBox(null)
            }}
            onAddField={(id) => {
              setAddingTo(id)
              showAdding({ at: 'list' })
            }}
            onShowField={(key) => showField(fieldIndex(key))}
            onShowBasic={showField}
          />

          <div className="flex flex-wrap gap-2.5 px-4 py-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                const { parts: next, id } = addBox(parts)
                set('listingParts', listingPartsKey(next))
                setOpenBox(id)
                setFreshBox(id)
              }}
              className={addButton}
            >
              + Add a box
            </button>
            {draft.fields.some((f) => f.type === 'boolean') && (
              <button
                type="button"
                onClick={() => setGroupForm({ audienceKey: '', prefix: '', phone: true, email: true, hours: true, notes: false })}
                className={addButton}
              >
                + Add audience group
              </button>
            )}
          </div>
        </AdminBox>

        {!isNew && draft.hasAddress && <WalkBox value={draft.walkList} onChange={(v) => set('walkList', v)} self={initial!} categories={siblings ?? []} />}

        <CardBox
          page={cardPage}
          sampleName={sampleName(draft.label, draft.pluralLabel)}
          open={openLine}
          onOpen={setOpenLine}
          onField={putOnCard}
          onOrder={(keys) => set('fields', reorderLine(pageFields, keys).map((f) => draftFieldByKey.get(f.key)!))}
          onShow={(line) => {
            setShowLine(line)
            history.pushState({ ...(window.history.state ?? {}), editorLine: line }, '')
            window.scrollTo?.(0, 0)
          }}
        />

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

/** The sample card's place: "A restaurant", or "A place" for a page
 *  whose name is no one place's ("Food"). */
export function sampleName(label: string, plural: string): string {
  const one = label.trim()
  return one && one.toLowerCase() !== plural.trim().toLowerCase() ? `A ${one.toLowerCase()}` : 'A place'
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
