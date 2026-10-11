'use client'

import { Suspense, useContext, useId, useState, type ReactNode } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { track } from '@vercel/analytics'
import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, resolveCapabilities, selectValues, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { ui } from '@/lib/uiConfig'
import { formatTodayHours, hasAnyHours } from '@/lib/hours'
import { useNow } from '@/lib/useNow'
import { useZmanim } from '@/lib/useZmanim'
import { useActiveCommunity, useCommunityTimezone } from '@/lib/communityContext'
import { useOptionalLocation } from '@/lib/locationContext'
import { useShareLink } from '@/lib/useShareLink'
import { directionsUrl, destinationQuery } from '@/lib/googleMapsLinks'
import { formatPhone } from '@/lib/validation'
import { candlesToday, initialsOf, listingRowFacts, listingRowNote, type RowFact } from '@/lib/listingRow'
import {
  audienceGroups,
  audienceStatus,
  compactWeek,
  confirmPlace,
  firstSentence,
  googleKeepsBox,
  sectionConfirmedAt,
  isWebsite,
  siteName,
  itemsField,
  listingActions,
  listingDistance,
  listingFacts,
  listingKind,
  mainThing,
  nearbyListings,
  primaryLink,
  boxConfirmKey,
  type ActionSpec,
  type AudienceGroup,
} from '@/lib/listingView'
import { parseWalkLists } from '@/lib/walkList'
import { boxesOf, mainCardOf, shabbosAfter, shabbosFieldsOf } from '@/lib/listingParts'
import { inSeason } from '@/lib/sukkosWindow'
import { clockTime } from '@/lib/upcomingDavening'
import { milesText } from '@/lib/geo'
import type { SearchFound } from '@/lib/askSearch'
import CategoryIcon from '@/components/CategoryIcon'
import PinnedBadge from '@/components/PinnedBadge'
import { usePinned } from '@/lib/pinnedContext'
import {
  CertificateIcon,
  CheckIcon,
  PlusIcon,
  ChevronRightIcon,
  ClockIcon,
  CrosshairIcon,
  DirectionsIcon,
  ExternalIcon,
  GlobeIcon,
  JoinIcon,
  MailIcon,
  PhoneIcon,
  PinIcon,
  ShareIcon,
} from '@/components/icons'
import Chip from './Chip'
import Highlight from './Highlight'
import DaveningCard from './DaveningCard'
import type { BoxEdit } from './BoxEditSheet'
import { minyanWriting } from '@/lib/minyanText'
import { TellAboutContext } from './tellAbout'
import { schedulesKey } from '@/lib/schedules'
import WalkLists from './WalkList'
import { SectionCard, ShabbosCard } from './listingCards'
import { FieldsBox } from './FieldsBox'
import { useNextMinyan } from './nextMinyans'
import { Card, shortDate } from './listingParts'
import FreshnessFooter from './FreshnessFooter'
import QuestionCard from './QuestionCard'
import TurnstileWidget from '@/components/TurnstileWidget'
import { useItemMarks, type ItemMarksApi } from './useItemMarks'
import { alreadyListed, dayText, itemSuggestions, itemWording, lastSeenText, seenLabel, type ItemMark, type ItemWording } from '@/lib/itemMarks'
import JoinLinkCheck from './JoinLinkCheck'

// ── An opened listing: the seven parts (see lib/listingView.ts) ─────────────
// The phone's sheet, the map's panel, the desktop column and a listing's own
// page all show this, so a place reads the same wherever it's opened. What
// wraps it (a sheet, a column with Back, a page with the guide's name) is
// the caller's.

export type Onward = {
  /** The category's listings, this one among them. */
  items: readonly DirectoryResource[]
  /** Where each is, in the row's words ("Rittenhouse"). */
  place: (item: DirectoryResource) => string | null
  onOpen: (item: DirectoryResource) => void
  /** "All 73 Food places": back to the whole list. */
  seeAll?: { label: string; onClick: () => void }
}

type Props = {
  item: DirectoryResource
  category: CategoryConfig
  color: string
  /** Where it is, in the row's words: "Bustleton". */
  place?: string | null
  /** The Recommend button, beside the name (UpvoteButton, `recommend`). */
  upvote?: ReactNode
  /** What the search that opened it matched: named first, marked in the
   *  items. */
  found?: SearchFound | null
  /** The listing's own URL, for Share. */
  path: string
  /** Part 6: the question, the dated line and Suggest an edit. */
  foot: ReactNode
  /** Part 7. Left out where there's no list to go on to (the map's panel,
   *  which has its own nearby list). */
  onward?: Onward
  /** Drawn in a wide column: a bigger picture. */
  wide?: boolean
  /** Where the places nearby also sit beside the listing (desktop, the map
   *  hidden), the classes that hide them here at that width. */
  onwardClassName?: string
  /** The listing's own page names itself with the page's one h1; inside a
   *  category page (the sheet, the column) the category holds that. */
  titleAs?: 'h1' | 'h2'
}

const TONE: Record<RowFact['tone'], string> = {
  open: 'text-emerald-700',
  caution: 'text-caution',
  closed: 'text-red-700',
  minyan: 'text-slate-900',
  opens: 'text-slate-700',
  quiet: 'text-muted',
  plain: 'text-slate-700',
}

// The edit sheet and the form fields it carries load when Edit is tapped,
// not with every listing: they were 15 KB on the home screen's first load.
const BoxEditSheet = dynamic(() => import('./BoxEditSheet'))

export default function ListingView({ item, category, color, place = null, upvote, found = null, path, foot, onward, wide = false, onwardClassName = '', titleAs: Title = 'h2' }: Props) {
  const { community } = useActiveCommunity()
  const clock = useNow()
  const now = clock === null ? null : new Date(clock)
  const timezone = useCommunityTimezone()
  const hoursFields = category.detailFields.filter((f) => f.type === 'hours')
  // A field shown only around Sukkos (a hospital's sukkah) is left out the
  // rest of the year, and until the page knows the date.
  const shabbosFields = shabbosFieldsOf(category)?.filter((f) => inSeason(f, now, timezone)) ?? null
  // Tonight's candle lighting, on a Friday or erev Yom Tov: a place that
  // shuts before it says so, and the Shabbos card's first line. The same
  // cached request the list makes.
  const { data: zmanim } = useZmanim(hoursFields.length > 0 || shabbosFields ? community.mapCenter : null)
  const candlesAt = candlesToday(zmanim, now)
  const shul = useNextMinyan(item.id)
  const { isPinned } = usePinned()

  const main = mainThing(item, category)
  // A listing's items and this visitor's answers about them, shared by the
  // items card and the one question below it.
  const itemsF = itemsField(category)
  const itemApi = useItemMarks(item, category, itemsF)
  // Where "Still right?" is asked: beside the one thing that's the
  // community's to keep, not about the whole listing (confirmPlace).
  const confirmAt = confirmPlace(item, category)
  // Edit under each main box (agreed Oct 10): a sheet with only that box's
  // fields (BoxEditSheet), where the category takes edits.
  const canEdit = ui.contributions.edit && resolveCapabilities(category.capabilities).edit
  const [boxEdit, setBoxEdit] = useState<BoxEdit | null>(null)
  const editBox = canEdit ? (edit: BoxEdit) => setBoxEdit(edit) : undefined
  const tellAbout = useContext(TellAboutContext)
  // "Add their menu" on a place with no dishes: the box, for the menu; its
  // do-it-yourself opens the card's own one-dish box. Where there's no box
  // (the Map), the card keeps "+ Add the first dish".
  const addMenu = tellAbout ? (addOne: () => void) => tellAbout(item, addOne, { menu: true }) : undefined
  const editElse = tellAbout
    ? () => {
        setBoxEdit(null)
        tellAbout(item)
      }
    : undefined
  const confirmLine = (edit?: BoxEdit) => (
    <FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} onEdit={edit && editBox ? () => editBox(edit) : undefined} />
  )
  const [joined, setJoined] = useState(false)
  const photo = typeof item[PHOTO_FIELD_KEY] === 'string' && (item[PHOTO_FIELD_KEY] as string).trim() ? (item[PHOTO_FIELD_KEY] as string) : undefined

  // ── 1 · Who and whether ────────────────────────────────────────────────
  const distance = listingDistance(item, community.region)
  const kindLine = [listingKind(item, category), category.hasAddress === false ? null : place].filter(Boolean).join(' · ')
  const facts = listingFacts(item, category)
  const note = listingRowNote(item, category, now, { shulNote: shul?.note })
  const caveat = note?.kind === 'exception' && note.tone === 'caution' ? note : null
  // A short description the admin put in the row ("Sit-down glatt kosher
  // steakhouse"): one line, under the header.
  const tagline = category.detailFields.find((f) => f.type === 'text' && f.showInHeader && f.headerMaxLength != null && String(item[f.key] ?? '').trim())
  const status = statusLine(item, category, now, shul, candlesAt)
  // A place with no address is what it's for: its description, said in the
  // Join box with Join (Oct 6), not down in About.
  const joinAbout =
    main === 'join' ? category.detailFields.filter((f) => f.type === 'textarea' && !f.audienceKey && String(item[f.key] ?? '').trim()) : []

  const who = (
    <div>
      <div className="flex items-start gap-3.5">
        {/* PinnedBadge, as on the row's own picture. */}
        <span className="relative shrink-0">
          <CategoryIcon
            icon={category.icon}
            categoryId={category.id}
            iconImageUrl={photo}
            initials={initialsOf(item.name)}
            shape="square"
            color={color}
            className={wide ? 'h-20 w-20 text-3xl' : 'h-16 w-16 text-2xl'}
            sizePx={wide ? 80 : 64}
          />
          {isPinned(item.id) && <PinnedBadge />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {/* The name links to the listing's own page: the address to send
                someone, and from the map, the way to its category. */}
            <Title className={`min-w-0 flex-1 font-extrabold leading-tight tracking-tight text-slate-900 ${wide ? 'text-[26px]' : 'text-[22px]'}`}>
              <Link href={path} className="hover:underline">
                {item.name}
              </Link>
            </Title>
            {upvote}
          </div>
          <p className="mt-1 text-[14.5px] leading-snug text-muted">
            {kindLine}
            {distance && (
              <>
                {kindLine && ' · '}
                <span className="whitespace-nowrap">{distance}</span>
              </>
            )}
          </p>
          {status.length > 0 && (
            <p className="mt-1.5 text-[15.5px] leading-snug" data-testid="listing-status">
              {status.map((part, i) => (
                <span key={`${part.text}:${i}`}>
                  {i > 0 && <span className="text-slate-500"> · </span>}
                  {part.prefix && <span className="text-slate-600">{part.prefix}</span>}
                  <span className={part.strong ? `font-bold ${TONE[part.tone]}` : TONE[part.tone]}>{part.text}</span>
                </span>
              ))}
            </p>
          )}
          {facts.length > 0 && (
            <p className="mt-1 text-[14.5px] font-bold text-slate-900" data-testid="listing-facts">
              {facts.join(' · ')}
            </p>
          )}
          {/* The warning alone, on one line: it decides the visit. What
              isn't kosher is said in full in the details. */}
          {caveat && (
            <p className="mt-1 text-sm font-semibold text-caution" data-testid="listing-caveat">
              {caveat.text}
            </p>
          )}
        </div>
      </div>
      {tagline && <p className="mt-2.5 text-[15px] leading-snug text-slate-800">{String(item[tagline.key]).trim()}</p>}
    </div>
  )

  // ── What the search found here ─────────────────────────────────────────
  const foundBox = found && (found.items.length > 0 || found.fields.length > 0) && (
    <div className="rounded-lg bg-primary/[0.07] px-3 py-2.5" data-testid="search-found">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-primary-dark">Matches your search</p>
      {found.items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {found.items.map((m) => (
            <Chip key={m.tag} tone="match" size="expanded">
              <Highlight text={m.tag} terms={found.terms} allowTypos />
              {m.sometimes ? ` · ${itemsF ? itemWording(itemsF).sometimes : 'not always in stock'}` : ''}
            </Chip>
          ))}
        </div>
      )}
      {found.fields.map((f) => (
        <p key={f.label} className="text-sm text-slate-700">
          {f.text ? (
            <>
              <span className="text-muted">{f.label}: </span>
              <Highlight text={f.text} terms={found.terms} />
            </>
          ) : (
            <Highlight text={f.label} terms={found.terms} />
          )}
        </p>
      ))}
    </div>
  )

  // ── 2 · Actions ────────────────────────────────────────────────────────
  const { buttons, extra } = listingActions(item, category)
  const join = main === 'join' ? primaryLink(item, category) : null
  const actions = join ? (
    // One box (Oct 6): who it's for, then Join with Share beside it, so the
    // listing isn't one big button over another (Suggest an edit is outlined
    // under it on these listings, ListingEditBar).
    <Card testId="listing-join-box" footer={confirmAt?.at === 'join' ? <JoinLinkCheck item={item} joined={joined} /> : undefined}>
      {joinAbout.map((f) => (
        <p key={f.key} className="whitespace-pre-line pt-2.5 text-[15.5px] leading-snug text-slate-800">{String(item[f.key]).trim()}</p>
      ))}
      <div className="flex items-center gap-2.5 pt-3.5 pb-1">
      <a
        href={join.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          track('listing_action', { action: join.field.linkLabel ?? join.field.label })
          setJoined(true)
        }}
        className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-full px-5 text-[15.5px] font-bold text-white transition-colors sm:max-w-sm ${
          isWhatsApp(category) ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-primary hover:bg-primary-dark'
        }`}
      >
        {isWhatsApp(category) ? <JoinIcon className="h-5 w-5" /> : <GlobeIcon className="h-5 w-5" />}
        {joinLabel(join.field, category, join.href)}
      </a>
      <ShareButton path={path} name={item.name} round />
      </div>
    </Card>
  ) : (
    // Spread across a phone's width, where they fill it; in the desktop
    // column, a set gap from the left, or the gaps grow with the column
    // (720px with the map hidden). The gap leaves room between the 84px
    // labels, which hang past each 64px button.
    <div className={`flex ${wide ? 'gap-8' : buttons.length >= 4 ? 'justify-between' : 'gap-3'}`} data-testid="listing-actions">
      {buttons.map((a) => (
        <ActionButton key={actionKey(a)} action={a} item={item} />
      ))}
      <ShareButton path={path} name={item.name} />
    </div>
  )

  // ── 3 · The main thing ─────────────────────────────────────────────────
  let mainSection: ReactNode = null
  const named = main === 'section' ? mainCardOf(category) : null
  if (named) {
    const edit = { title: named.label, fields: [...named.fields] }
    mainSection = (
      <SectionCard
        item={item}
        title={named.label}
        fields={named.fields}
        footer={confirmAt?.at === 'card' ? confirmLine(edit) : undefined}
        onAnswer={editBox ? (preset) => editBox({ ...edit, preset }) : undefined}
      />
    )
  } else if (main === 'davening') {
    const f = category.detailFields.find((x) => x.type === 'minyanim')!
    mainSection = (
      <DaveningCard
        item={item}
        minyanim={item[f.key]}
        schedules={item[schedulesKey(f.key)]}
        category={category}
        onEditBox={editBox ? (box, title) => editBox({ title, fields: [f], minyanimBox: box, writing: minyanWriting }) : undefined}
      />
    )
  } else if (main === 'items' && itemsF) {
    mainSection = <ItemsCard field={itemsF} found={found} api={itemApi} menuUrl={menuUrlOf(item)} onAddMenu={addMenu} />
  } else if (main === 'groups') {
    mainSection = (
      <GroupBoxes
        item={item}
        groups={audienceGroups(item, category)}
        now={now}
        candlesAt={candlesAt}
        onEdit={
          editBox
            ? (g) => {
                // The section's hours and note, written or not; anything
                // else (a phone, an email) only once it's there, as the box
                // shows it. An empty box for every field was clutter.
                const fields = category.detailFields.filter(
                  (f) => f.audienceKey === g.key && f.renderAs !== 'hidden' && (f.type === 'hours' || f.type === 'textarea' || String(item[f.key] ?? '').trim() !== ''),
                )
                editBox({ title: fields.some((f) => f.type === 'hours') ? `${g.label} hours` : g.label, fields })
              }
            : undefined
        }
      />
    )
  } else if (main === 'walk') {
    const lists = parseWalkLists(category.walkList)
    mainSection = lists.length > 0 && item.geo ? <WalkLists lists={lists} from={item.geo} fromLabel={category.label} fromItem={item} /> : null
  }

  // The admin's boxes (a hospital's "Who to call", "Kosher food", Oct 6),
  // then any list of contacts in none of them, as a box of its own. Each
  // dated on its own.
  const configured = boxesOf(category)
  const placed = new Set([...configured.flatMap((b) => b.fields.map((f) => f.key)), ...(named?.fields.map((f) => f.key) ?? []), ...(shabbosFieldsOf(category) ?? []).map((f) => f.key)])
  const boxDefs = [
    ...configured,
    ...category.detailFields.filter((f) => f.type === 'contacts' && f.renderAs !== 'hidden' && !placed.has(f.key)).map((f) => ({ title: f.label, fields: [f] })),
  ]
  const boxes = boxDefs.map((b) => {
    const key = boxConfirmKey(item, b.fields)
    return (
      <FieldsBox
        key={b.title}
        item={item}
        title={b.title}
        fields={b.fields}
        footer={
          key && confirmAt?.at === 'boxes' ? (
            <FreshnessFooter
              resourceId={item.id}
              confirmedAt={sectionConfirmedAt(item, key)}
              section={key}
              onEdit={editBox ? () => editBox({ title: b.title, fields: [...b.fields] }) : undefined}
            />
          ) : undefined
        }
      />
    )
  })

  // ── 4 · Details ────────────────────────────────────────────────────────
  const showAddress = category.hasAddress !== false && !!item.address
  const showPhone = category.hasPhone !== false && !!item.phone
  // The place's hours, in the contact box: today, opening to the week. A
  // mikvah's are in its own boxes, one per audience.
  const otherHours = main === 'groups' ? [] : hoursFields.filter((f) => !f.audienceKey && hasAny(item[f.key]))
  // When Google last updated the box, at its foot (Oct 6): one date for
  // the box, not a list of which of its lines are Google's.
  const googleLead = googleKeepsBox(item, { hours: otherHours.length > 0 }) ? `Last updated from Google, ${shortDate(item.googleSyncedAt!, clock)}` : null
  // The website, by name, with the address and phone (Oct 6): its round
  // button above says only "Website".
  const website = buttons.find((a): a is Extract<ActionSpec, { kind: 'link' }> => a.kind === 'link' && isWebsite(a.field))
  const websiteName = website ? siteName(website.href) : null
  const shownElsewhere = new Set<string>([
    ...placed,
    ...(tagline ? [tagline.key] : []),
    ...(named ? named.fields.map((f) => f.key) : []),
    ...(shabbosFields ?? []).map((f) => f.key),
    ...joinAbout.map((f) => f.key),
    ...(join ? [join.field.key] : []),
    ...buttons.flatMap((a) => (a.kind === 'link' || a.kind === 'email' ? [a.field.key] : [])),
    ...extra.flatMap((a) => (a.kind === 'link' || a.kind === 'email' ? [a.field.key] : [])),
  ])
  // Not a hidden field: a hechsher's "what isn't kosher" is one, said with
  // its caveat in the header, not a second time here.
  const aboutFields = category.detailFields.filter(
    (f) => f.type === 'textarea' && f.renderAs !== 'hidden' && !f.audienceKey && !shownElsewhere.has(f.key) && String(item[f.key] ?? '').trim(),
  )
  const detailFields = category.detailFields.filter(
    (f) =>
      (f.type === 'text' || f.type === 'tel' || f.type === 'number') &&
      !f.audienceKey &&
      !shownElsewhere.has(f.key) &&
      (f.renderAs ?? 'row') === 'row' &&
      String(item[f.key] ?? '').trim(),
  )
  // Badges that aren't facts in the header: the ones not tied to a filter.
  const quietBadges = category.detailFields.filter(
    (f) =>
      (f.type === 'boolean' || f.type === 'select') &&
      (f.renderAs ?? (f.type === 'boolean' ? 'badge' : 'row')) === 'badge' &&
      !f.filterable &&
      (f.type === 'boolean' ? !!item[f.key] : selectValues(item[f.key]).length > 0),
  )
  // Tags fields other than the items the main thing lists.
  const otherTags = category.detailFields.filter(
    (f) => f.type === 'tags' && f.key !== itemsF?.key && selectValues(item[f.key]).length + selectValues(item[`${f.key}_sometimes`]).length > 0,
  )
  // The contact box: address, phone, hours, links. No heading: its icons
  // say what each line is (Oct 6).
  // "Set as my location" under the address, on every listing with one (the
  // user, Oct 10): someone planning where they'll be wants to see how far
  // the next thing is from there. It was a hospital's only (Oct 6).
  const showSetLocation = category.hasAddress !== false && !!item.geo
  const details = (caveat?.title || showAddress || showSetLocation || showPhone || websiteName || otherHours.length > 0 || detailFields.length > 0 || extra.length > 0 || quietBadges.length > 0 || otherTags.length > 0) && (
    <Card testId="listing-details" footer={googleLead && <span data-testid="listing-google">{googleLead}.</span>}>
    <div className="divide-y divide-slate-100">
      {caveat?.title && (
        <Row>
          <span className="block text-[13px] font-semibold text-caution">What isn’t kosher</span>
          <span className="text-caution" data-testid="listing-caveat-note">{caveat.title}</span>
        </Row>
      )}
      {showAddress && (
        // The address alone (Oct 6): how far is in the line under the name
        // already, and here it read as a second, duller copy of it.
        <Row icon={<PinIcon className="h-[17px] w-[17px]" />}>{item.address}</Row>
      )}
      {showSetLocation && <SetLocationRow item={item} />}
      {showPhone && (
        <Row icon={<PhoneIcon className="h-[17px] w-[17px]" />}>
          <a href={`tel:${item.phone!.replace(/\D/g, '')}`} className="text-primary hover:underline">
            {item.phone}
          </a>
        </Row>
      )}
      {website && websiteName && (
        <Row icon={<GlobeIcon className="h-[17px] w-[17px]" />}>
          <a href={website.href} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
            {websiteName}
          </a>
        </Row>
      )}
      {otherHours.map((f) => (
        <Row key={f.key} icon={<ClockIcon className="h-[17px] w-[17px]" />}>
          {otherHours.length > 1 && <span className="block text-[13px] text-muted">{f.label}</span>}
          <HoursRow value={item[f.key]} now={now} candlesAt={candlesAt} />
        </Row>
      ))}
      {extra.map((a) => (
        <Row
          key={actionKey(a)}
          icon={
            a.kind === 'email' ? (
              <MailIcon className="h-[17px] w-[17px]" />
            ) : a.kind === 'link' && a.field.linkInDetails ? (
              <ExternalIcon className="h-[17px] w-[17px]" />
            ) : (
              <GlobeIcon className="h-[17px] w-[17px]" />
            )
          }
        >
          {a.kind === 'email' ? (
            <a href={`mailto:${a.address}`} className="text-primary hover:underline">{a.address}</a>
          ) : a.kind === 'link' ? (
            <a href={a.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{(isWebsite(a.field) && siteName(a.href)) || a.field.linkLabel || a.field.label}</a>
          ) : null}
        </Row>
      ))}
      {detailFields.map((f) => (
        <Row key={f.key}>
          {!f.hideLabel && <span className="block text-[13px] text-muted">{f.label}</span>}
          {f.type === 'tel' ? (
            <a href={`tel:${String(item[f.key]).replace(/\D/g, '')}`} className="text-primary hover:underline">{formatPhone(String(item[f.key]))}</a>
          ) : (
            String(item[f.key])
          )}
        </Row>
      ))}
      {quietBadges.length > 0 && (
        <Row>
          {quietBadges
            .map((f) => (f.type === 'boolean' ? f.label : `${f.label}: ${selectValues(item[f.key]).map((v) => f.options?.find((o) => o.value === v)?.label ?? v).join(', ')}`))
            .join(' · ')}
        </Row>
      )}
      {otherTags.map((f) => (
        <Row key={f.key}>
          <span className="block text-[13px] text-muted">{f.label}</span>
          {[...selectValues(item[f.key]), ...selectValues(item[`${f.key}_sometimes`]).map((t) => `${t} (sometimes)`)].join(', ')}
        </Row>
      ))}
    </div>
    </Card>
  )

  // ── 5 · About ──────────────────────────────────────────────────────────
  // A place with no address is its description: it's said under the name,
  // with Join, rather than again down here.
  // In a box with no heading (Oct 6). "From Google" only when the sync is
  // known to keep it: descriptions fetched before it recorded that aren't
  // marked either way, so nothing is said rather than guessing whose they
  // are.
  const fromGoogle = aboutFields.some((f) => f.key === 'googleDescription') && !!item.placeId && !!item.googleFields?.includes('description')
  const about = aboutFields.length > 0 && (
    <Card testId="listing-about" footer={fromGoogle ? 'Description from Google' : undefined}>
      <div className="space-y-3 pt-2.5">
        {aboutFields.map((f) => (
          <p key={f.key} className="whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{String(item[f.key]).trim()}</p>
        ))}
      </div>
    </Card>
  )

  const walkLists = parseWalkLists(category.walkList)
  const walks = walkLists.length > 0 && item.geo && main !== 'walk' ? <WalkLists lists={walkLists} from={item.geo} fromLabel={category.label} fromItem={item} /> : null
  // The Shabbos card comes right after the main thing on a Friday or Erev
  // Yom Tov, until candle lighting; the rest of the week, after the places
  // within a walk.
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : null
  const shabbosFirst = candlesAt !== null && nowMinutes !== null && nowMinutes < candlesAt
  const shabbos = shabbosFields ? <ShabbosCard item={item} fields={shabbosFields} zmanim={zmanim} candlesAt={candlesAt} /> : null
  // Among the boxes where the admin put it ("after A place to stay"), or
  // after the places within a walk, as it always went.
  const after = shabbosAfter(category)
  const amongBoxes = !!shabbos && !shabbosFirst && after !== null && boxes.length > 0
  const boxesAndShabbos = amongBoxes ? [...boxes.slice(0, after), <div key="shabbos">{shabbos}</div>, ...boxes.slice(after!)] : boxes

  return (
    <div className="space-y-5" data-testid="listing-view">
      {who}
      {foundBox}
      {actions}
      {mainSection}
      {shabbosFirst && shabbos}
      {boxesAndShabbos}
      {/* A hotel's walk list is its main thing; anywhere else, the places
          within a walk follow it (a hospital's food, shuls and hotels). */}
      {walks}
      {!shabbosFirst && !amongBoxes && shabbos}
      {/* A place whose list has nothing on it yet: just "+ Add the first
          item", after whatever it leads with. */}
      {main !== 'items' && itemsF && itemApi.marks.length === 0 && itemApi.canReport && <ItemsCard field={itemsF} found={null} api={itemApi} menuUrl={menuUrlOf(item)} onAddMenu={addMenu} />}
      {details}
      {about}
      {/* Part 6: the one thing this listing doesn't say yet that a tap can
          answer (pickListingQuestion); nothing when there's nothing. */}
      <QuestionCard category={category} listing={item} items={main === 'items' && itemsF ? { field: itemsF, api: itemApi } : undefined} />
      {/* No dated strip at the end any more (Oct 6): each date is in the
          box it's about. Just Suggest an edit. */}
      {foot && <div className="pt-1" data-testid="listing-foot">{foot}</div>}
      {onward && <OnwardSection item={item} category={category} color={color} onward={onward} className={onwardClassName} />}
      {/* Its own boundary: loading it the first time otherwise hid the
          listing for a moment, and the listing came back at its top. */}
      <Suspense fallback={null}>
        {boxEdit && <BoxEditSheet item={item} category={category} edit={boxEdit} onClose={() => setBoxEdit(null)} onEditElse={editElse} />}
      </Suspense>
    </div>
  )
}

// ── 7 · Onward ─────────────────────────────────────────────────────────────

/** The three nearest in the same category, each saying how far it is from
 *  this one, then the way back to all of them. At the end of the listing;
 *  on desktop with the map hidden, beside it, where the map was (`aside`). */
export function OnwardSection({
  item,
  category,
  color,
  onward,
  aside = false,
  className = '',
}: {
  item: DirectoryResource
  category: CategoryConfig
  color: string
  onward: Onward
  aside?: boolean
  className?: string
}) {
  const { community } = useActiveCommunity()
  const clock = useNow()
  const now = clock === null ? null : new Date(clock)
  const { data: zmanim } = useZmanim(category.detailFields.some((f) => f.type === 'hours') ? community.mapCenter : null)
  const candlesAt = candlesToday(zmanim, now)
  const nearby = nearbyListings(item, onward.items)
  if (nearby.length === 0) return null
  const frame = `rounded-2xl border border-slate-200 bg-white px-4 ${aside ? 'pt-4 pb-4' : 'pt-4 pb-3'}`
  return (
    <section className={`${frame} ${className}`} data-testid={aside ? 'listing-onward-aside' : 'listing-onward'}>
      <h2 className="text-[17px] font-extrabold text-slate-900">
        {category.hasAddress === false ? `Other ${category.pluralLabel}` : `More ${category.pluralLabel.toLowerCase()} near here`}
      </h2>
      <div className="mt-2">
        {nearby.map(({ item: other, miles }) => (
          <NearbyRow key={other.id} item={other} category={category} color={color} miles={miles} place={onward.place(other)} now={now} candlesAt={candlesAt} onOpen={() => onward.onOpen(other)} />
        ))}
      </div>
      {onward.seeAll && (
        <button
          type="button"
          onClick={onward.seeAll.onClick}
          className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-slate-300 text-[15px] font-bold text-primary hover:bg-slate-50"
        >
          {onward.seeAll.label}
        </button>
      )}
    </section>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────

type StatusBit = { text: string; tone: RowFact['tone']; strong?: boolean; prefix?: string }

/** The header's status, in the row's words: "Until 3 PM, before candles",
 *  "Next: Kabbalas Shabbos 6:13 PM", "Men’s open now · Keilim until 7 PM". */
function statusLine(
  item: DirectoryResource,
  category: CategoryConfig,
  now: Date | null,
  shul: ReturnType<typeof useNextMinyan>,
  candlesAt: number | null,
): StatusBit[] {
  if (audienceGroups(item, category).length > 0) {
    return audienceStatus(item, category, now).map((p) => ({ text: p.text, tone: p.tone === 'open' ? 'open' : 'plain', strong: p.tone === 'open' }))
  }
  if (shul) {
    return shul.tone === 'minyan' ? [{ prefix: 'Next: ', text: shul.text, tone: 'minyan', strong: true }] : [{ text: shul.text, tone: 'quiet', strong: true }]
  }

  const first = listingRowFacts(item, category, now, { candlesAt })[0]
  if (!first || first.tone === 'plain') return []
  return [{ text: first.text, tone: first.tone, strong: first.tone !== 'quiet' }]
}

function hasAny(v: unknown): boolean {
  if (typeof v === 'string') return v.trim() !== ''
  return hasAnyHours(v)
}

const isWhatsApp = (category: CategoryConfig) => /whatsapp/i.test(category.label)

/** The one link's button: "Join the group" for a WhatsApp group (one line
 *  on a phone, under "WhatsApp Group"); "Visit tribe12.org" for a website
 *  (Oct 6: a network's listing is its site, and "Website" in WhatsApp green
 *  read as a group); otherwise what the admin called it. */
function joinLabel(field: CategoryField, category: CategoryConfig, href: string): string {
  const label = field.linkLabel ?? field.label
  if (isWhatsApp(category) && /^join/i.test(label)) return 'Join the group'
  if (/website/i.test(label)) {
    const site = siteName(href)
    return site ? `Visit ${site}` : label
  }
  return label
}

function actionKey(a: ActionSpec): string {
  return a.kind === 'link' || a.kind === 'email' ? `${a.kind}:${a.field.key}` : a.kind
}

function Circle({ children }: { children: ReactNode }) {
  return <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/15">{children}</span>
}

function ActionButton({ action, item }: { action: ActionSpec; item: DirectoryResource }) {
  const location = useOptionalLocation()
  let href: string
  let label: string
  let icon: ReactNode
  if (action.kind === 'directions') {
    href = directionsUrl(destinationQuery(item.name, item.address!, { alwaysIncludeName: !!item.verifiedPlaceId }), {
      origin: location?.directionsOrigin ?? null,
      placeId: (item.placeId ?? item.verifiedPlaceId) as string | undefined,
    })
    label = 'Directions'
    icon = <DirectionsIcon className="h-5 w-5" />
  } else if (action.kind === 'call') {
    href = `tel:${item.phone!.replace(/\D/g, '')}`
    label = 'Call'
    icon = <PhoneIcon className="h-5 w-5" />
  } else if (action.kind === 'email') {
    href = `mailto:${action.address}`
    label = 'Email'
    icon = <MailIcon className="h-5 w-5" />
  } else {
    href = action.href
    label = action.field.linkLabel ?? action.field.label
    const words = `${action.field.key} ${label}`.toLowerCase()
    icon = /website/.test(words) ? (
      <GlobeIcon className="h-5 w-5" />
    ) : /certif|hechsher|kosher/.test(words) ? (
      <CertificateIcon className="h-5 w-5" />
    ) : (
      <ExternalIcon className="h-5 w-5" />
    )
  }
  const external = action.kind === 'link' || action.kind === 'directions'
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      onClick={() => track('listing_action', { action: label })}
      className="group flex w-16 flex-col items-center gap-1 text-primary"
    >
      <Circle>{icon}</Circle>
      <span className="w-[84px] truncate text-center text-xs font-semibold">{label}</span>
    </a>
  )
}

/** Distances everywhere measured from this place: a hospital, for the
 *  family staying near it. The same anchor as the overflow fan's Set as
 *  location (useListingActions), as a row under the address. Not drawn where
 *  there's no LocationProvider (the admin's preview). */
function SetLocationRow({ item }: { item: DirectoryResource }) {
  const location = useOptionalLocation()
  if (!location || !item.geo) return null
  const set = location.anchorListingId === item.id
  return (
    <Row icon={set ? <CheckIcon className="h-[17px] w-[17px] text-emerald-700" /> : <CrosshairIcon className="h-[17px] w-[17px]" />}>
      <button
        type="button"
        aria-pressed={set}
        onClick={() => {
          track('listing_action', { action: set ? 'Unset location' : 'Set as location' })
          if (set) location.unsetListingAnchor()
          else location.setListingAnchor({ id: item.id, name: item.name, coords: item.geo! })
        }}
        className="cursor-pointer text-left font-semibold text-primary hover:underline"
        data-testid="set-location"
      >
        {set ? 'Your location' : 'Set as my location'}
      </button>
      <span className="block text-[13px] text-muted">{set ? 'The guide’s distances are from here. Tap to undo.' : 'The guide’s distances, from here'}</span>
    </Row>
  )
}

function ShareButton({ path, name, round = false }: { path: string; name: string; round?: boolean }) {
  const { share, copied } = useShareLink(path, name)
  if (round) {
    return (
      <button type="button" onClick={(e) => share(e)} aria-label={copied ? 'Link copied' : `Share ${name}`} className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/15">
        <ShareIcon className="h-5 w-5" />
      </button>
    )
  }
  return (
    <button type="button" onClick={(e) => share(e)} className="group flex w-16 cursor-pointer flex-col items-center gap-1 text-primary">
      <Circle>
        <ShareIcon className="h-5 w-5" />
      </Circle>
      <span className="text-xs font-semibold">{copied ? 'Copied!' : 'Share'}</span>
    </button>
  )
}

function Row({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 text-[15px] leading-snug text-slate-800">
      <span className="mt-0.5 w-[17px] shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}


function WeekLines({ value, now, candlesAt, compact = false }: { value: unknown; now: Date; candlesAt: number | null; compact?: boolean }) {
  const week = compactWeek(value, now, { keepRuns: compact })
  if (!week) {
    const text = formatTodayHours(value, now)
    return text ? <p className="text-[15px] text-slate-800">{text}</p> : null
  }
  const candles = candlesAt != null ? clockTime(candlesAt) : null
  return (
    <div className={compact ? '' : 'divide-y divide-slate-200/70'}>
      {week.map((line) => (
        <div key={line.label} className={`grid grid-cols-[7.5rem_1fr] gap-2.5 ${compact ? 'py-0.5 text-[14.5px]' : 'py-1.5 text-[15px]'} ${line.isToday && !compact ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
          <span>
            {line.label}
            {line.isToday && !compact && ' · today'}
          </span>
          <span>
            {line.text}
            {line.isToday && candles && !compact && <span className="block text-[13px] font-medium text-muted">Candle lighting is {candles}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

/** A place's hours as one line of the contact box: today's, opening to the
 *  week. Hours written as words are just said. */
function HoursRow({ value, now, candlesAt }: { value: unknown; now: Date | null; candlesAt: number | null }) {
  const [open, setOpen] = useState(false)
  if (!now) return null
  const today = formatTodayHours(value, now)
  if (!today) return null
  if (typeof value === 'string') return <p>{today}</p>
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-center justify-between gap-3 text-left">
        <span>{today}</span>
        <ChevronRightIcon className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && (
        <div className="mt-1.5">
          <WeekLines value={value} now={now} candlesAt={candlesAt} />
        </div>
      )}
    </div>
  )
}


const ITEMS_SHOWN = 6

/** The menu a place's dishes were read from (the admin's Main dishes tab),
 *  when it's a web address. */
function menuUrlOf(item: DirectoryResource): string | null {
  const url = item.menuUrl
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null
}

/** A listing's items, each with when someone last saw it there, and a tap
 *  on one to say whether it still is (agreed Oct 1): "Still here" counts at
 *  once, "Not anymore" warns at once and asks an admin to take it off. A
 *  small ⌄ on each row says it opens; no line explaining it, and none
 *  saying where a menu's dishes came from (the user, Oct 10: clear without
 *  words).
 *
 *  A restaurant's main dishes the same way, in a dish's words ("Still
 *  served", "+ Add a dish"), with "Full menu" for the rest of the menu.
 *  With none yet, just "Add their menu" (Oct 10): the "+ Add" box for the
 *  menu, a link, a pasted menu or photos, whose do-it-yourself is one dish
 *  (`onAddMenu`, given the way to open that dish box). */
function ItemsCard({ field, found, api, menuUrl, onAddMenu }: { field: CategoryField; found: SearchFound | null; api: ItemMarksApi; menuUrl: string | null; onAddMenu?: (addOne: () => void) => void }) {
  const timezone = useCommunityTimezone()
  const clock = useNow()
  const say = itemWording(field)
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const matched = new Set(found?.items.map((m) => m.tag) ?? [])
  const rows = [...api.marks]
  // What the search asked for first, so "See all" can't hide it.
  rows.sort((a, b) => Number(matched.has(b.name)) - Number(matched.has(a.name)))
  const shown = all ? rows : rows.slice(0, ITEMS_SHOWN)
  return (
    <Card
      title={rows.length ? `${field.label} · ${rows.length}` : field.label}
      testId="listing-items"
      action={
        menuUrl && (
          <a href={menuUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[14px] font-bold text-primary hover:underline" data-testid="full-menu">
            Full menu
          </a>
        )
      }
    >
      <ul className="divide-y divide-slate-200/70">
        {shown.map((m) => {
          const key = `${m.key}:${m.name}`
          const isOpen = open === key
          const seen = seenLabel(m, clock, timezone)
          return (
            <li key={key} data-testid="listing-item" className={isOpen ? '-mx-2 my-1 rounded-xl border border-slate-300 bg-white px-2' : ''}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : key)}
                className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 py-2 text-left"
              >
                <span className={`text-[15px] font-semibold ${matched.has(m.name) ? 'text-primary-dark' : 'text-slate-900'}`}>
                  {m.name}
                  {m.sometimes && <span className="ml-1.5 text-[12.5px] font-semibold text-caution">{say.sometimes}</span>}
                </span>
                {isOpen ? (
                  <ChevronRightIcon className="h-4 w-4 shrink-0 -rotate-90 text-slate-500" />
                ) : (
                  <span className="flex shrink-0 items-center gap-1">
                    {seen && <span className={`whitespace-nowrap text-[13px] ${seen.old ? 'text-caution' : 'text-muted'}`}>{seen.text}</span>}
                    <ChevronRightIcon className="h-4 w-4 rotate-90 text-slate-400" />
                  </span>
                )}
              </button>
              {m.goneAt && !isOpen && <GoneNote at={m.goneAt} clock={clock} />}
              {isOpen && <ItemAnswer mark={m} api={api} clock={clock} say={say} />}
            </li>
          )
        })}
        {/* What this visitor added: theirs alone until an admin checks it. */}
        {api.added.map((a) => (
          <li key={`added:${a.name}`} data-testid="listing-item-added" className="py-2">
            <span className="text-[15px] font-semibold text-slate-900">
              {a.name}
              {a.sometimes && <span className="ml-1.5 text-[12.5px] font-semibold text-caution">{say.sometimes}</span>}
            </span>
            {/* No Undo (agreed Oct 1): it only waits for a check, as the
                "where did you see it?" box's does, and a wrong one is
                simply rejected there. */}
            <p role="status" className="mt-0.5 text-[13px] leading-snug text-muted">
              Added by you · waiting for a check
            </p>
          </li>
        ))}
      </ul>
      {rows.length > ITEMS_SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1.5 inline-flex min-h-9 cursor-pointer items-center gap-1 text-[14.5px] font-bold text-primary">
          {all ? 'Fewer' : `All ${rows.length} ${say.nouns}`}
          <ChevronRightIcon className={`h-4 w-4 transition-transform ${all ? '-rotate-90' : ''}`} />
        </button>
      )}
      {/* "+ Add an item": the list's own last row (agreed Oct 1), where
          someone who's just seen something new finds it isn't listed. */}
      {api.canReport && onAddMenu && say.noun === 'dish' && rows.length + api.added.length === 0 && !adding ? (
        <button
          type="button"
          onClick={() => onAddMenu(() => setAdding(true))}
          className="mt-1 flex h-11.5 w-full cursor-pointer items-center justify-center gap-2 rounded-full border-[1.5px] border-primary text-[15px] font-bold text-primary hover:bg-primary/5"
        >
          <PlusIcon className="h-4 w-4" />
          Add their menu
        </button>
      ) : api.canReport &&
        (adding ? (
          <AddItemBox
            api={api}
            say={say}
            onClose={() => setAdding(false)}
            onListed={(m) => {
              setAdding(false)
              setOpen(`${m.key}:${m.name}`)
              setAll(true)
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`flex min-h-11 w-full cursor-pointer items-center gap-2 py-2.5 text-left text-[15px] font-bold text-primary ${rows.length + api.added.length > 0 ? 'mt-0.5 border-t border-slate-200' : ''}`}
          >
            <PlusIcon className="h-4 w-4" />
            {rows.length ? say.add : say.addFirst}
          </button>
        ))}
    </Card>
  )
}

/** "What did you see here?": suggestions from the item names as it's typed,
 *  the store's own items marked (picking one is its "Still here"), a name
 *  not on the list as typed, "Not always in stock", then Add. */
function AddItemBox({ api, say, onClose, onListed }: { api: ItemMarksApi; say: ItemWording; onClose: () => void; onListed: (m: ItemMark) => void }) {
  const [text, setText] = useState('')
  const [sometimes, setSometimes] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const name = text.trim().replace(/\s+/g, ' ')
  const suggestions = itemSuggestions(name, api.marks, 4, { dishes: say.noun === 'dish' }).filter((x) => x.name.toLowerCase() !== name.toLowerCase())
  const send = async (what: string) => {
    const listed = alreadyListed(api.marks, what)
    if (listed) {
      api.seen(listed, 'row')
      return onListed(listed)
    }
    setBusy(true)
    setError(null)
    const outcome = await api.add(what, sometimes)
    setBusy(false)
    if (outcome === 'failed') setError('That didn’t send. Please try again.')
    else onClose()
  }
  const bold = (label: string) => {
    const i = label.toLowerCase().indexOf(name.toLowerCase())
    return i < 0 ? label : (
      <>
        {label.slice(0, i)}
        <b>{label.slice(i, i + name.length)}</b>
        {label.slice(i + name.length)}
      </>
    )
  }
  const row = 'flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 border-t border-slate-100 px-3 text-left text-[15px] text-slate-900 first:border-t-0 hover:bg-slate-50'
  return (
    <div className="-mx-2 mt-2 rounded-xl border border-slate-300 bg-white px-2 pt-3 pb-2.5" data-testid="add-item">
      <label htmlFor={inputId} className="text-[14px] font-bold text-slate-900">
        {say.addPrompt}
      </label>
      <input
        id={inputId}
        autoFocus
        value={text}
        maxLength={60}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.length >= 2 && !busy) void send(name)
          if (e.key === 'Escape') onClose()
        }}
        className="mt-2 h-11 w-full rounded-[10px] border-2 border-slate-300 px-3 text-base text-slate-900 outline-none focus:border-primary"
      />
      {name.length >= 2 && (suggestions.length > 0 || !alreadyListed(api.marks, name)) && (
        <div className="mt-1.5 overflow-hidden rounded-[10px] border border-slate-200">
          {suggestions.map((x) => (
            <button key={x.name} type="button" disabled={busy} onClick={() => (x.listed ? void send(x.name) : setText(x.name))} className={row}>
              <span className="py-2">
                {bold(x.name)}
                {x.listed && <span className="block text-[13px] text-muted">Already here · tap to say it’s {say.still.toLowerCase()}</span>}
              </span>
            </button>
          ))}
          {!suggestions.some((x) => x.name.toLowerCase() === name.toLowerCase()) && (
            <button type="button" disabled={busy} onClick={() => void send(name)} className={`${row} bg-slate-50 text-[14.5px] text-muted`}>
              Add “{name}” as typed
            </button>
          )}
        </div>
      )}
      <label className="mt-2.5 flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-slate-900">
        <input type="checkbox" checked={sometimes} onChange={(e) => setSometimes(e.target.checked)} className="h-5 w-5 accent-primary" />
        {say.sometimesBox}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || name.length < 2}
          onClick={() => void send(name)}
          className="h-11 flex-1 cursor-pointer rounded-[10px] bg-primary text-[15px] font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-default disabled:opacity-45"
        >
          {busy ? 'Sending…' : 'Add'}
        </button>
        <button type="button" onClick={onClose} className="h-11 cursor-pointer px-3 text-[15px] font-bold text-slate-500 hover:text-slate-700">
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13.5px] text-red-700">
          {error}
        </p>
      )}
      <p className="mt-2 text-[13px] leading-snug text-muted">An admin checks it before everyone sees it.</p>
      {api.challenge?.from === 'add' && busy && <TurnstileWidget key={api.challenge.attempt} onVerify={api.challenge.onVerify} />}
    </div>
  )
}

function GoneNote({ at, clock }: { at: string; clock: number | null }) {
  const timezone = useCommunityTimezone()
  return (
    <p className="-mt-1 pb-2 text-[13px] font-semibold leading-snug text-caution">
      Reported gone {dayText(at, clock, timezone)} · we’ll check before taking it off
    </p>
  )
}

/** An opened item: when it was last seen, and Still here or Not anymore;
 *  once answered, thanks and Undo. */
function ItemAnswer({ mark: m, api, clock, say }: { mark: ItemMark; api: ItemMarksApi; clock: number | null; say: ItemWording }) {
  const timezone = useCommunityTimezone()
  const { mine, busy, error } = api.stateOf(m)
  const button =
    'flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-slate-300 bg-white text-[14.5px] font-bold text-slate-900 transition-colors hover:bg-slate-50 disabled:cursor-default disabled:opacity-60'
  const undo = mine?.undoable && (
    <button type="button" disabled={busy} onClick={() => api.undo(m)} className="ml-1.5 cursor-pointer font-bold text-primary hover:underline disabled:opacity-50">
      {busy ? 'Undoing…' : 'Undo'}
    </button>
  )
  return (
    <div className="pb-2.5">
      {m.goneAt && !mine ? (
        <GoneNote at={m.goneAt} clock={clock} />
      ) : (
        !mine && <p className="text-[13px] leading-snug text-muted">{lastSeenText(m, clock, timezone)}</p>
      )}
      {mine ? (
        <p role="status" className={`text-[14px] leading-snug ${mine.kind === 'seen' ? 'text-emerald-700' : 'text-caution'}`}>
          {mine.kind === 'seen'
            ? '✓ Thanks! Marked as seen today.'
            : mine.undoable
              ? 'Thanks. We’ll check before taking it off.'
              : 'Someone said so already. We’ll check before taking it off.'}
          {undo}
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy} onClick={() => api.seen(m, 'row')} className={button}>
            <CheckIcon className="h-4 w-4 text-primary" />
            {say.still}
          </button>
          {api.canReport && !m.goneAt && (
            <button type="button" disabled={busy} onClick={() => api.gone(m, 'row')} className={button}>
              Not anymore
            </button>
          )}
        </div>
      )}
      {busy && !mine && <p className="mt-1.5 text-[13px] text-muted">Sending…</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-[13.5px] text-red-700">
          {error}
        </p>
      )}
      {api.challenge?.from === 'row' && busy && <TurnstileWidget key={api.challenge.attempt} onVerify={api.challenge.onVerify} />}
    </div>
  )
}

/** A mikvah's sections, a box each (Oct 6): today's hours, its phone and
 *  email, and the first sentence of its notes; opened, the week and the
 *  notes whole instead, nothing said twice. "Still right?" about each one's
 *  hours in its own box, on its own date: one line for all three read as
 *  the last one's, and someone who uses one knows that one. */
function GroupBoxes({
  item,
  groups,
  now,
  candlesAt,
  onEdit,
}: {
  item: DirectoryResource
  groups: AudienceGroup[]
  now: Date | null
  candlesAt: number | null
  onEdit?: (group: AudienceGroup) => void
}) {
  return (
    <div className="space-y-3" data-testid="listing-groups">
      {groups.map((g) => (
        <GroupBox key={g.key} item={item} group={g} now={now} candlesAt={candlesAt} onEdit={onEdit ? () => onEdit(g) : undefined} />
      ))}
    </div>
  )
}

function GroupBox({
  item,
  group,
  now,
  candlesAt,
  onEdit,
}: {
  item: DirectoryResource
  group: AudienceGroup
  now: Date | null
  candlesAt: number | null
  onEdit?: () => void
}) {
  const [open, setOpen] = useState(false)
  const hoursF = group.fields.find((f) => f.type === 'hours')
  const today = hoursF && now ? formatTodayHours(item[hoursF.key], now) : null
  const hasWeek = !!hoursF && typeof item[hoursF.key] !== 'string' && hasAnyHours(item[hoursF.key])
  const isEmail = (f: CategoryField) => f.type === 'text' && /@/.test(String(item[f.key]))
  const contacts = group.fields.filter((f) => f.type === 'tel' || isEmail(f))
  const texts = group.fields.filter((f) => (f.type === 'textarea' || f.type === 'text') && !isEmail(f)).map((f) => String(item[f.key]).trim())
  const lead = texts.length > 0 ? firstSentence(texts[0]) : null
  const more = [lead?.rest, ...texts.slice(1)].filter((t): t is string => !!t)
  const foldable = (hasWeek && !!now) || more.length > 0
  const shut = !open || !foldable
  // Each section's own date and its Edit, always (Oct 10): "Confirmed Oct 4
  // · Edit", "Still right?" with Yes and Edit once that's old. It used to
  // wait until the section was opened (Oct 6).
  return (
    <Card
      title={group.label}
      footer={(!!hoursF || !!onEdit) && <FreshnessFooter resourceId={item.id} confirmedAt={sectionConfirmedAt(item, group.key)} section={group.key} onEdit={onEdit} />}
    >
      <div className="divide-y divide-slate-100">
        {today && shut && (
          <Row icon={<ClockIcon className="h-[17px] w-[17px]" />}>
            <span>{today}</span>
          </Row>
        )}
        {contacts.map((f) => {
          const v = String(item[f.key]).trim()
          return f.type === 'tel' ? (
            <Row key={f.key} icon={<PhoneIcon className="h-[17px] w-[17px]" />}>
              <a href={`tel:${v.replace(/\D/g, '')}`} className="text-primary hover:underline">
                {formatPhone(v)}
              </a>
            </Row>
          ) : (
            <Row key={f.key} icon={<MailIcon className="h-[17px] w-[17px]" />}>
              <a href={`mailto:${v}`} className="text-primary hover:underline">
                {v}
              </a>
            </Row>
          )
        })}
        {lead && shut && <p className="py-2.5 text-[15px] leading-relaxed whitespace-pre-line text-slate-700">{lead.first}</p>}
        {!shut && (
          <div className="space-y-2.5 py-2.5" data-testid="listing-group-more">
            {hasWeek && now && <WeekLines value={item[hoursF!.key]} now={now} candlesAt={candlesAt} />}
            {texts.map((t, i) => (
              <p key={i} className="text-[15px] leading-relaxed whitespace-pre-line text-slate-700">
                {t}
              </p>
            ))}
          </div>
        )}
      </div>
      {foldable && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex cursor-pointer items-center gap-1 py-1.5 text-[14.5px] font-bold text-primary">
          {/* "More", whatever's folded: "Week and notes" was one more
              thing to read (the user, Oct 10). */}
          {open ? 'Less' : 'More'}
          <ChevronRightIcon className={`h-4 w-4 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
        </button>
      )}
    </Card>
  )
}

function NearbyRow({
  item,
  category,
  color,
  miles,
  place,
  now,
  candlesAt,
  onOpen,
}: {
  item: DirectoryResource
  category: CategoryConfig
  color: string
  miles: number | null
  place: string | null
  now: Date | null
  candlesAt: number | null
  onOpen: () => void
}) {
  const shul = useNextMinyan(item.id)
  // The row's own facts, with the distance measured from the place above.
  const facts = listingRowFacts({ ...item, milesFromAddress: miles ?? undefined, milesFromCenter: undefined }, category, now, { shul, candlesAt }).filter((f) => !f.ownLine).map((f) =>
    miles != null && f.text === milesText(miles) ? { ...f, text: `${f.text} away` } : f,
  )
  const description = category.hasAddress === false ? String(item.description ?? '').trim() : ''
  const photo = typeof item[PHOTO_FIELD_KEY] === 'string' && (item[PHOTO_FIELD_KEY] as string).trim() ? (item[PHOTO_FIELD_KEY] as string) : undefined
  return (
    <button type="button" onClick={onOpen} className="flex w-full cursor-pointer items-start gap-3 border-t border-slate-100 py-3 text-left hover:bg-slate-50">
      <CategoryIcon icon={category.icon} categoryId={category.id} iconImageUrl={photo} initials={initialsOf(item.name)} shape="square" color={color} className="h-12 w-12 text-xl" sizePx={48} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          <span className="text-base font-bold text-slate-900">{item.name}</span>
          {place && <span className="text-sm text-muted"> · {place}</span>}
        </span>
        {facts.length > 0 ? (
          <span className="mt-0.5 block truncate text-[13.5px] text-slate-600">
            {facts.map((f, i) => (
              <span key={`${f.text}:${i}`}>
                {i > 0 && <span className="px-1 text-slate-400">·</span>}
                <span className={TONE[f.tone]}>{f.text}</span>
              </span>
            ))}
          </span>
        ) : (
          description && <span className="mt-0.5 block truncate text-[13.5px] text-slate-600">{description}</span>
        )}
      </span>
    </button>
  )
}
