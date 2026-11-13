'use client'

import { useEffect, useRef, useState } from 'react'
import type { DirectoryResource } from '@/types'
import Link from 'next/link'
import { DEFAULT_CATEGORY_ICON, bandImageFor, type CategoryConfig } from '@/lib/categories'
import { getCategoryColor } from '@/lib/categoryColor'
import { groupByFromKey } from '@/lib/listGroups'
import { questionCardFromKey } from '@/lib/questionCards'
import { walkListFromKey } from '@/lib/walkList'
import { listingPartsFromKey, listingPartsKey, listingPartsToSave } from '@/lib/listingParts'
import { addBox, addToBox, basicLandsIn, basicsLandIn, fieldBoxes, madeField, ownBox, placeBasic, removeBox, renameBox, whereAdded, type FieldPage } from '@/lib/fieldBoxes'
import { adminBase } from '@/lib/adminNav'
import { useIsDesktop } from '@/lib/useIsMobile'
import CategoryIcon from '@/components/CategoryIcon'
import FieldBoxes, { addBoxButton, PlusIcon } from './FieldBoxes'
import WalkBox from './WalkBox'
import CardBox, { ShowOnLine, type CardLine } from './CardBox'
import { cardPatch, reorderLine, type CardPage } from '@/lib/cardLines'
import CategoryPreview, { type PreviewView } from './CategoryPreview'
import { sampleName } from '@/lib/fieldLooks'
import { CardBandImageField } from './CategoryFormFields'
import { partnerOf, partnerRule } from '@/lib/fieldPartners'
import FieldScreen from './FieldScreen'
import FieldLooks from './FieldLooks'
import { CleanupConfirm, RenameConfirm, IdRenameConfirm } from './CategorySaveConfirmations'
import { draftMeaning, mergeFieldsWithHidden, normalizeField, toDraft, type Draft } from './categoryEditorLogic'
import { useCategoryFieldEditing } from './useCategoryFieldEditing'
import { useCategorySaveWorkflow } from './useCategorySaveWorkflow'
import { AdminBack, AdminBox, AdminField, AdminPreviewButton, AdminSwitch, AdminYesNo, Chevron, adminInputClass } from './AdminUI'
import { AddListButton } from './DragList'
import DeletePage from './DeletePage'
import RemoveField, { type Removing } from './RemoveField'
import FieldPicker, { type FieldPickerScreen } from './FieldPicker'
import { PreviewBeside } from './SitePreview'
import SaveBar, { LEAVE_QUESTION, useLeaveGuard } from './SaveBar'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import { takeCategoryListings } from '@/lib/categoryListings'
import { fieldFromRef, fieldRef, screenFromSearch, type EditorScreen } from '@/lib/editorScreenUrl'
import { focusOn } from '@/lib/previewFocus'
import { useScreenHistory } from './useScreenHistory'

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
  return (Object.keys(draft) as (keyof Draft)[]).filter((k) => !FOLLOWING_KEYS.has(k) && draftMeaning(k, draft[k]) !== draftMeaning(k, saved[k])).length
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
  // The Eruv's page (Nov 9): its fields and boxes, as every page's, and
  // none of what a page of places has besides (Within a walk, Before it's
  // opened, Questions). Its preview is the page alone.
  const eruvPage = initial?.kind === 'eruv'
  const community = useCommunitySlug()
  const [previewing, setPreviewing] = useState(false)
  // Page, A listing or Adding, beside the settings and opened full size.
  const [previewView, setPreviewView] = useState<PreviewView>('page')
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
  // A box of the listing's own just made the admin's by a press on its name:
  // its id now, its name then, and the boxes before.
  const owned = useRef<{ id: string; title: string; before: string } | null>(null)
  // The row just added, lit in its box (E1b: every box is open).
  const [landed, setLanded] = useState<string | null>(null)
  // A box just added, its name selected to type over (board 19).
  const [freshBox, setFreshBox] = useState<string | null>(null)
  // The fields there were before an add, to find the one added.
  const [landing, setLanding] = useState<ReadonlySet<string> | null>(null)
  // Before it's opened: the line open, and board 23's screen for one.
  const [openLine, setOpenLine] = useState<CardLine | null>(null)
  const [showLine, setShowLine] = useState<'second' | 'third' | null>(null)
  const [placeCount, setPlaceCount] = useState<number | null>(null)
  // This page's places, for How it looks to draw a field on a real one (the
  // user, Nov 10: "it's not previewing with the fields we actually have").
  const [realPlaces, setRealPlaces] = useState<DirectoryResource[]>([])
  const setPlaces = (places: DirectoryResource[]) => {
    setPlaceCount(places.length)
    setRealPlaces(places)
  }
  // "Remove this field" on one places have answered: its own step first
  // (board 16), and the removals answered there, so Save doesn't ask again.
  const [removing, setRemoving] = useState<Removing | null>(null)
  // The banner picker's memory of the photo behind its crop, kept here: the
  // picker unmounts whenever the Banner photo row closes.
  const [bannerOriginal, setBannerOriginal] = useState<File | string | null>(null)
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set())
  const counting = useRef(false)
  const wide = useIsDesktop('(max-width: 1023px)')
  // Beside, the page's own preview counts its places; without it (a phone),
  // count them here.
  const countId = !wide && !isNew && !eruvPage ? initial.id : null
  // The Eruv's are eruvim, not listings: counted as Places counts them.
  useEffect(() => {
    if (!eruvPage) return
    let cancelled = false
    fetch(withCommunity('/api/admin/eruvim', community), { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const body = await res.json()
        if (!cancelled && res.ok && body.ok) setPlaceCount((body.eruvim as { active: boolean }[]).filter((e) => e.active).length)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [eruvPage, community, token])
  useEffect(() => {
    if (!countId) return
    let cancelled = false
    takeCategoryListings(countId)
      .then(({ ok, resources }) => {
        if (!cancelled && ok) {
          setPlaceCount(resources.length)
          setRealPlaces(resources)
        }
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
    togglePartner,
  } = useCategoryFieldEditing(initial, seed)

  // The screen the address names, on opening: a reload, a link, or Back
  // from another tab lands where the history says (editorScreenUrl.ts).
  const screens = useScreenHistory()
  const fieldsNow = useRef(draft.fields)
  useEffect(() => {
    fieldsNow.current = draft.fields
  })
  const [restored, setRestored] = useState(false)
  if (!restored) {
    setRestored(true)
    if (typeof window !== 'undefined') {
      const s = screenFromSearch(window.location.search)
      const open = fieldFromRef(draft.fields, s.field)
      if (open !== null || s.add) setFieldsOpen(true)
      setOpenField(open)
      setAdding(s.add ?? null)
      setAddingTo(s.into ?? null)
      setShowLine(s.line ?? null)
      setPreviewing(!!s.preview)
    }
  }

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

  // Each screen is an entry in the history with its own address, so
  // browser/trackpad Back and Forward (and the preview's own Up button,
  // which calls history.back) land on it instead of skipping past it to the
  // category list. What shows is read from the address, never kept apart
  // from it. A removal's step holds a count read just before, kept here for
  // Back and Forward onto it, and read again after a reload.
  const lastRemoving = useRef<Removing | null>(null)
  const removeStep = useRef<(ref: string | undefined) => void>(() => {})
  useEffect(() => {
    function onPopState() {
      const s = screenFromSearch(window.location.search)
      setPreviewing(!!s.preview)
      setOpenField(fieldFromRef(fieldsNow.current, s.field))
      setAdding(s.add ?? null)
      setAddingTo(s.into ?? null)
      setShowLine(s.line ?? null)
      if (s.remove) removeStep.current(s.field)
      else setRemoving(null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const screenNow = (): EditorScreen => ({
    ...(openField !== null && { field: fieldRef(draft.fields, openField) }),
    ...(adding && { add: adding }),
    ...(adding && addingTo && { into: addingTo }),
    ...(showLine && { line: showLine }),
  })
  // Through Next's router, so the entry is one it made (editorScreenUrl.ts),
  // one move at a time (useScreenHistory.ts).
  function go(next: EditorScreen) {
    void screens.push(next)
  }

  function openPreview() {
    setPreviewing(true)
    go({ ...screenNow(), preview: true })
  }

  function showField(i: OpenField) {
    setFieldsOpen(true)
    setOpenField(i)
    go({ field: fieldRef(fieldsNow.current, i) })
    window.scrollTo?.(0, 0)
  }

  function showAdding(next: FieldPickerScreen, into: string | null = addingTo) {
    setFieldsOpen(true)
    setAdding(next)
    setAddingTo(into)
    go({ add: next, ...(into && { into }) })
    window.scrollTo?.(0, 0)
  }

  // Added: back to the page, past the picker's screens (the list, and the
  // field looked at or the kind picked). Make your own opens the new
  // field's screen, to name it.
  function added(i: number | null) {
    void screens.back(adding?.at === 'list' ? 1 : 2).then(() => {
      if (i !== null) showField(i)
    })
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
      return
    }
    const next: Removing = { target, label, count, filter }
    lastRemoving.current = next
    setRemoving(next)
    // From the list, by the row's X (the user, Nov 10): the step is the
    // field's address with remove, and Back is to the list.
    const at = typeof target === 'object' ? fieldsNow.current.findIndex((f) => f.key === target.field) : target
    go({ field: fieldRef(fieldsNow.current, at), remove: true })
    window.scrollTo?.(0, 0)
  }

  // The Remove step the address names: the one held, or counted again (a
  // reload, or Forward onto it after one), the field showing meanwhile.
  // Nothing to lose by then: the address goes back to the field.
  async function showRemoveStep(ref: string | undefined) {
    const open = fieldFromRef(fieldsNow.current, ref)
    if (open === null) return
    const f = typeof open === 'number' ? fieldsNow.current[open] : null
    const target: Removing['target'] = f ? { field: f.key } : (open as 'address' | 'phone')
    const held = lastRemoving.current
    if (held && confirmKey(held.target) === confirmKey(target)) return setRemoving(held)
    setRemoving(null)
    const count = await countAnswers(target)
    const still = screenFromSearch(window.location.search)
    if (!still.remove || still.field !== ref) return
    if (!count) return void screens.replace({ ...still, remove: false })
    const next: Removing = { target, label: f ? f.label || 'New field' : open === 'address' ? 'Address' : 'Phone', count, filter: !!f && (f.type === 'tags' ? f.itemFilter !== false : !!normalizeField(f).filterable) }
    lastRemoving.current = next
    setRemoving(next)
  }
  useEffect(() => {
    removeStep.current = (ref) => void showRemoveStep(ref)
  })
  useEffect(() => {
    const s = screenFromSearch(window.location.search)
    if (s.remove) void showRemoveStep(s.field)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on opening only
  }, [])

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
    description: draft.description,
    detailFields: mergeFieldsWithHidden(draft.fields.map(normalizeField), draft.hiddenFields),
    kind: initial?.kind ?? 'listing',
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

  // Page, A listing or Adding (boards 4 and 5): the page on a computer, the
  // other two as a phone shows them. No Adding where visitors can't add.
  // The Eruv page's Editing is an eruv's Edit listing: visitors don't add
  // eruvim, they suggest edits to them.
  const views: { view: PreviewView; label: string }[] = eruvPage
    ? [
        { view: 'page', label: 'Page' },
        { view: 'listing', label: 'A listing' },
        { view: 'adding', label: 'Editing' },
      ]
    : [
        { view: 'page', label: 'Page' },
        { view: 'listing', label: 'A listing' },
        ...(draft.capabilities.add ? [{ view: 'adding' as const, label: 'Adding' }] : []),
      ]
  const shownView = views.some((v) => v.view === previewView) ? previewView : 'page'
  const name = draft.pluralLabel.trim() || (isNew ? 'New category page' : initial!.pluralLabel)
  const pinColor = draft.pinColor || fallbackPinColor
  const field = typeof openField === 'number' ? draft.fields[openField] : undefined
  // The page as the preview shows it, on the field open (previewFocus.ts).
  const focused = focusOn(previewCategory, typeof openField === 'number' ? field : (openField ?? undefined))
  // Full size, the screen showing the field draws it, so a field Add a
  // field is looking at (worked out there, with what's been set on it) is
  // in it too. Every other screen: here.
  const drawnByScreen = wide && !removing && (!adding || adding.at === 'look')
  if (previewing && !drawnByScreen) return <CategoryPreview category={focused.category} focusField={focused.focus} view={shownView} onClose={() => void screens.back()} />

  // The page beside the settings, on a computer only: there's no room on
  // anything narrower. Clicking it opens it full size, to try.
  // `focus`: the field an admin is looking at, which Adding opens on.
  // `onField`: beside one of the Eruv page's fields, which isn't on its
  // list of eruvim, so only where it is: A listing and Editing.
  const previewOf = (category: CategoryConfig, focus?: string, onField = false) => {
    const tabs = onField ? views.filter((v) => v.view !== 'page') : views
    const shownView = tabs.some((v) => v.view === previewView) ? previewView : tabs[0].view
    return previewing ? (
      <CategoryPreview category={category} focusField={focus} view={shownView} onClose={() => void screens.back()} />
    ) : (
    <aside aria-label="Preview" className="shrink-0 sticky top-8 self-start flex w-[340px] flex-col gap-3">
      {tabs.length > 1 && (
        <div role="group" aria-label="Preview of" className="flex rounded-lg border border-slate-300 bg-white p-0.5">
          {tabs.map((v) => (
            <button
              key={v.view}
              type="button"
              aria-pressed={shownView === v.view}
              onClick={() => setPreviewView(v.view)}
              className={`flex-1 min-h-10 rounded-md text-sm font-semibold cursor-pointer ${shownView === v.view ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      <PreviewBeside onOpen={openPreview} device={shownView === 'page' ? 'computer' : 'phone'} shownWidth={340}>
        {() => <CategoryPreview inline view={shownView} category={category} focusField={focus} onClose={() => {}} onListings={setPlaces} />}
      </PreviewBeside>
    </aside>
  )
  }
  // Beside a field, the field where a visitor meets it, on a made-up place
  // (boards 33c and 34, FieldLooks.tsx); the whole page one link away.
  const looksOf = (look: { category: CategoryConfig; focus?: string }, onShowOnRow?: (line: 'second' | 'third') => void) => {
    const f = look.category.detailFields.find((x) => x.key === look.focus)
    // An eruv isn't a made-up place to draw a field on: a real one, opened
    // and in its Edit listing, instead.
    if (eruvPage) return previewOf(look.category, look.focus, !!f)
    if (previewing || !f) return previewOf(look.category, look.focus)
    return (
      <FieldLooks
        category={look.category}
        field={f}
        placeName={sampleName(draft.label, draft.pluralLabel)}
        askedWhen={field?.showIf}
        canAdd={draft.capabilities.add}
        realPlaces={realPlaces}
        onShowOnRow={onShowOnRow}
        onWholePage={() => {
          setPreviewView('page')
          openPreview()
        }}
      />
    )
  }
  const showOnRow = (line: 'second' | 'third') => {
    setShowLine(line)
    go({ ...screenNow(), line })
    window.scrollTo?.(0, 0)
  }
  const preview = wide && (typeof openField === 'number' && field ? looksOf(focused, showOnRow) : previewOf(focused.category, focused.focus))

  // Fields, as the listing's boxes (fieldBoxes.ts). A field not named yet
  // has no key: it goes by its place.
  const pageFields = draft.fields.map((f, i) => ({ ...normalizeField(f), key: f.key || `#${i}` }))
  const draftFieldByKey = new Map(pageFields.map((f, i) => [f.key, draft.fields[i]]))
  const fieldPage: FieldPage = { fields: pageFields, hiddenFields: draft.hiddenFields, hasAddress: draft.hasAddress, hasPhone: draft.hasPhone }
  const parts = listingPartsFromKey(draft.listingParts)
  const boxes = fieldBoxes(fieldPage, parts)
  const addingBox = addingTo ? boxes.find((b) => b.id === addingTo) : undefined
  // A field added to a box of the listing's own makes it the admin's, in
  // its place (ownBox): the box it lands in.
  const ownAddingBox = () => {
    if (!addingTo) return addingTo
    const own = ownBox(parts, boxes, addingTo, fieldPage)
    if (own.id !== addingTo) set('listingParts', listingPartsKey(own.parts))
    return own.id
  }
  // Just added: its row is scrolled to and lit.
  if (landing) {
    const key = pageFields.find((f) => !landing.has(f.key))?.key
    setLanding(null)
    if (key !== undefined) setLanded(`field:${key}`)
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
        onKeep={() => void screens.back()}
        onRemove={() => {
          takeOff(removing.target)
          setConfirmed((c) => new Set(c).add(confirmKey(removing.target)))
          void screens.back()
        }}
      />
    )
  } else if (showLine) {
    screen = (
      <ShowOnLine
        line={showLine}
        fields={pageFields}
        // From a field's How it looks, Back is to the field.
        back={{ label: typeof openField === 'number' && field ? field.label || 'New field' : name, onClick: () => void screens.back() }}
        onPick={(key) => {
          putOnCard(key, true)
          void screens.back()
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
        kind={eruvPage ? 'eruv' : 'listing'}
        screen={adding}
        onScreen={(next) => showAdding(next)}
        onBack={() => void screens.back()}
        onAdd={(row) => {
          if (row.basic === 'address' || row.basic === 'phone') setLanded(`basic:${row.basic}`)
          else setLanding(new Set(pageFields.map((f) => f.key)))
          if (row.basic === 'address' || row.basic === 'phone') {
            // In the box it was added from (the user, Nov 10: "move all
            // fields. Including address and phone").
            if (addingTo && addingTo !== 'contact') {
              const own = ownBox(parts, boxes, addingTo, fieldPage)
              set('listingParts', listingPartsKey(placeBasic(own.parts, row.basic, own.id)))
            }
            if (row.basic === 'address') {
              set('hasAddress', true)
              setCap('map', true)
            } else set('hasPhone', true)
          }
          else if (row.basic === 'hours') toggleHoursField(true)
          else if (row.basic === 'website') toggleWebsiteField(true)
          else if (row.field) addReadyField(row.field, row.companions, ownAddingBox(), row.partner)
          added(null)
        }}
        canRequire={draft.capabilities.add || draft.capabilities.edit}
        // From a box's "+ Add a field": only what lands in it (the user,
        // Nov 9 and 10), the davening times included in one of the
        // admin's boxes. Not one of a mikvah's sections' fields: a section
        // comes with its switch, from + Add audience group.
        into={addingBox ? {
          heading: `Add a field to ${addingBox.title || 'New box'}`,
          offers: (row) => {
            if (row.basic === 'address' || row.basic === 'phone') return basicLandsIn(addingBox, fieldPage)
            if (!row.field) return basicsLandIn(addingBox)
            return whereAdded(addingBox, normalizeField(row.field), fieldPage) === 'here'
          },
          kindFits: (type) => whereAdded(addingBox, madeField(type, '', '#new'), fieldPage) === 'here',
        } : undefined}
        // A field before adding: the page beside with it there.
        besides={
          wide
            ? (f) => {
                // In the box it's being added to, as Add would put it.
                const look = focusOn(previewCategory, normalizeField(f))
                if (!addingTo || !look.focus) return looksOf(look)
                const own = ownBox(parts, boxes, addingTo, fieldPage)
                const placed = listingPartsToSave(listingPartsKey(addToBox(own.parts, own.id, look.focus))) ?? undefined
                return looksOf({ ...look, category: { ...look.category, listingParts: placed } })
              }
            : undefined
        }
        onMakeOwn={(type, label) => {
          setLanding(new Set(pageFields.map((f) => f.key)))
          added(addOwnField(type, label, ownAddingBox()))
        }}
      />
    )
  } else if (field && typeof openField === 'number') {
    // A field's own screen (board 13). What the board leaves off (only for
    // some places, an audience, a link's own box, a badge in place of
    // another, the order) is a superadmin's, under More.
    const i = openField
    screen = (
      <FieldScreen
        key={i}
        field={field}
        pageName={name}
        // "Required" only matters if people can add or edit listings.
        canRequire={draft.capabilities.add || draft.capabilities.edit}
        onChange={(patch) => updateField(i, patch)}
        onKosherQuestions={(on) => toggleFieldCaveat(i, on)}
        partner={partnerRule(field) ? { on: !!partnerOf(draft.fields, field), onChange: (on) => togglePartner(i, on) } : undefined}
        // An eruv isn't listed on rows (no "Before it's opened").
        rows={!eruvPage}
        onBack={() => void screens.back()}
      />
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
                color={pinColor}
                className="h-11 w-11 text-2xl"
                sizePx={44}
              />
            }
            banner={bandImageFor(previewCategory)}
            bannerFields={
              <CardBandImageField
                cardBandImageUrl={draft.cardBandImageUrl}
                cardImageUrl={draft.cardImageUrl}
                onChange={(band, card) => {
                  set('cardBandImageUrl', band)
                  set('cardImageUrl', card)
                }}
                token={token}
                originalSource={bannerOriginal}
                onOriginalSourceChange={setBannerOriginal}
              />
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
            freshId={freshBox}
            landed={landed}
            onChange={(next, order) => {
              set('listingParts', listingPartsKey(next))
              if (order) set('fields', order.map((k) => draftFieldByKey.get(k)!))
            }}
            onRename={(id, title) => set('listingParts', listingPartsKey(renameBox(parts, id, title)))}
            onOwnBox={(id) => {
              // Renamed: a box of the listing's own becomes the admin's, its
              // name ready to type.
              const own = ownBox(parts, boxes, id, fieldPage)
              owned.current = { id: own.id, title: boxes.find((b) => b.id === id)?.title ?? '', before: draft.listingParts }
              set('listingParts', listingPartsKey(own.parts))
              setFreshBox(own.id)
            }}
            onRenameEnd={(id, title) => {
              // Left as it was: the box is the listing's own again, as if
              // its name was never pressed (the user, Nov 10: "even just
              // clicking something triggers a change").
              const was = owned.current
              owned.current = null
              setFreshBox(null)
              if (was?.id === id && title.trim() === was.title) set('listingParts', was.before)
            }}
            onRemoveBox={(id) => {
              // Its fields come off the page with it (the user, Nov 10), the
              // address and phone too; nothing's gone until Save, and Undo
              // brings it back.
              const box = boxes.find((b) => b.id === id)
              if (!box) return
              const gone = new Set(box.fields)
              const kept = draft.fields.filter((_, i) => !gone.has(pageFields[i].key))
              set('listingParts', listingPartsKey(removeBox(parts, id)))
              if (kept.length !== draft.fields.length) set('fields', kept)
              // A hechsher's "what isn't kosher" is its switch on the hechsher.
              const owner = kept.findIndex((f) => f.caveat && (gone.has(f.caveat.flagField) || gone.has(f.caveat.noteField)))
              if (owner >= 0) toggleFieldCaveat(owner, false)
              if (box.basics?.includes('address')) {
                set('hasAddress', false)
                setCap('map', false)
              }
              if (box.basics?.includes('phone')) set('hasPhone', false)
            }}
            onAddField={(id) => {
              showAdding({ at: 'list' }, id)
            }}
            onShowField={(key) => showField(fieldIndex(key))}
            onRemoveRow={(r) => {
              if (r === 'address' || r === 'phone') return void askRemove(r, r === 'address' ? 'Address' : 'Phone', false)
              const i = fieldIndex(r.field)
              const f = draft.fields[i]
              if (!f) return
              // A field not named yet has nothing anyone has answered.
              if (!f.key) return removeField(i)
              void askRemove({ field: f.key }, f.label || 'New field', f.type === 'tags' ? f.itemFilter !== false : !!normalizeField(f).filterable)
            }}
          />

          <div className="flex flex-col gap-2.5 px-4 pb-4 pt-2">
            <button
              type="button"
              onClick={() => {
                // In place, at the end, its name ready to type (board B).
                const { parts: next, id } = addBox(parts, boxes)
                set('listingParts', listingPartsKey(next))
                setFreshBox(id)
              }}
              className={addBoxButton}
            >
              {PlusIcon}
              Add a box
            </button>
            {!eruvPage && draft.fields.some((f) => f.type === 'boolean') && (
              <AddListButton onClick={() => setGroupForm({ audienceKey: '', prefix: '', phone: true, email: true, hours: true, notes: false })}>
                Add audience group
              </AddListButton>
            )}
          </div>
        </AdminBox>

        {!isNew && draft.hasAddress && <WalkBox value={draft.walkList} onChange={(v) => set('walkList', v)} self={initial!} categories={siblings ?? []} />}

        {!eruvPage && <CardBox
          page={cardPage}
          sampleName={sampleName(draft.label, draft.pluralLabel)}
          open={openLine}
          onOpen={setOpenLine}
          onField={putOnCard}
          onOrder={(keys) => set('fields', reorderLine(pageFields, keys).map((f) => draftFieldByKey.get(f.key)!))}
          onShow={(line) => {
            setShowLine(line)
            go({ line })
            window.scrollTo?.(0, 0)
          }}
        />}

        {!eruvPage && <AdminBox title="Questions" foldOnPhone summary={draft.upvotesEnabled ? 'Upvotes on' : 'Upvotes off'}>
          <AdminYesNo question="Can visitors upvote places?" value={draft.upvotesEnabled} onChange={(yes) => set('upvotesEnabled', yes)} />
          <AdminYesNo question="A link for places not listed here?" value={draft.externalLinkEnabled} onChange={(yes) => set('externalLinkEnabled', yes)} />
          {draft.externalLinkEnabled && (
            <div className="flex flex-col gap-4 p-4 border-t border-slate-100">
              <AdminField label="What the link says">
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
        </AdminBox>}

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
        {/* Not beside Add a field or a removal (boards 7-12, 16). */}
        {!adding && !removing && preview}
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

export { sampleName } from '@/lib/fieldLooks'

/** "Address, Phone, Hours and 3 more" under the folded Fields row. */
export function fieldsSummary(labels: string[]): string {
  const named = labels.filter(Boolean)
  if (named.length === 0) return 'No fields yet'
  if (named.length <= 3) return named.join(', ')
  return `${named.slice(0, 3).join(', ')} and ${named.length - 3} more`
}

/** A page's Basics (board 4): its icon beside its name, then the banner
 *  photo as a row. The icon is shown, not set: the site draws each kind's
 *  line icon, and the banner is the page's one picture (the user, Nov 11:
 *  "maybe we don't need the option to change the icon"). */
function Basics({
  name,
  onName,
  icon,
  banner,
  bannerFields,
}: {
  name: string
  onName: (name: string) => void
  icon: React.ReactNode
  banner: string | null
  bannerFields: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="flex flex-col gap-3 p-4 border-b border-slate-100">
        <div className="flex items-end gap-3">
          <span className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-700">Icon</span>
            <span data-testid="category-icon-preview">{icon}</span>
          </span>
          <span className="flex-1 min-w-0">
            <AdminField label="Name">
              <input value={name} onChange={(e) => onName(e.target.value)} className={adminInputClass} placeholder="Name" />
            </AdminField>
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 min-h-[60px] text-left cursor-pointer hover:bg-slate-50"
      >
        <span className="flex-1 text-[15px] font-semibold text-slate-900">Banner photo</span>
        <BannerThumb url={banner} />
        <span className={open ? 'rotate-90' : ''}>
          <Chevron />
        </span>
      </button>
      {open && <div className="flex flex-col gap-3 px-4 pb-4">{bannerFields}</div>}
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
