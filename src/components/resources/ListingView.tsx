'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { track } from '@vercel/analytics'
import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, selectValues, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { formatTodayHours, isStructuredHours } from '@/lib/hours'
import { useNow } from '@/lib/useNow'
import { useZmanim } from '@/lib/useZmanim'
import { useActiveCommunity } from '@/lib/communityContext'
import { useOptionalLocation } from '@/lib/locationContext'
import { useShareLink } from '@/lib/useShareLink'
import { directionsUrl, destinationQuery } from '@/lib/googleMapsLinks'
import { formatPhone } from '@/lib/validation'
import { candlesToday, initialsOf, listingRowFacts, listingRowNote, type RowFact } from '@/lib/listingRow'
import {
  audienceGroups,
  audienceStatus,
  compactWeek,
  itemsField,
  listingActions,
  listingDistance,
  listingFacts,
  listingKind,
  mainThing,
  nearbyListings,
  primaryLink,
  type ActionSpec,
  type AudienceGroup,
} from '@/lib/listingView'
import { parseWalkList } from '@/lib/walkList'
import { clockTime } from '@/lib/upcomingDavening'
import { roundMiles } from '@/lib/geo'
import type { SearchFound } from '@/lib/askSearch'
import CategoryIcon from '@/components/CategoryIcon'
import PinnedBadge from '@/components/PinnedBadge'
import { usePinned } from '@/lib/pinnedContext'
import {
  CertificateIcon,
  ChevronRightIcon,
  ClockIcon,
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
import HoursDisplay from './HoursDisplay'
import DaveningCard from './DaveningCard'
import WalkList from './WalkList'
import { useNextMinyan } from './nextMinyans'
import { Card, shortDate } from './listingParts'

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

export default function ListingView({ item, category, color, place = null, upvote, found = null, path, foot, onward, wide = false, onwardClassName = '', titleAs: Title = 'h2' }: Props) {
  const { community } = useActiveCommunity()
  const clock = useNow()
  const now = clock === null ? null : new Date(clock)
  const hoursFields = category.detailFields.filter((f) => f.type === 'hours')
  // Tonight's candle lighting, on a Friday or erev Yom Tov: a place that
  // shuts before it says so. The same cached request the list makes.
  const { data: zmanim } = useZmanim(hoursFields.length > 0 ? community.mapCenter : null)
  const candlesAt = candlesToday(zmanim, now)
  const shul = useNextMinyan(item.id)
  const { isPinned } = usePinned()

  const main = mainThing(item, category)
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
  const headerAbout =
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
          {caveat && (
            <p className="mt-1 text-sm font-semibold text-caution" data-testid="listing-caveat">
              {caveat.text}
              {caveat.title ? `: ${caveat.title}` : ''}
            </p>
          )}
        </div>
      </div>
      {tagline && <p className="mt-2.5 text-[15px] leading-snug text-slate-800">{String(item[tagline.key]).trim()}</p>}
      {/* A place with no address is what it's for: its description, then
          Join. Said here rather than down in About. */}
      {headerAbout.map((f) => (
        <p key={f.key} className="mt-3 whitespace-pre-line text-[15.5px] leading-snug text-slate-800">{String(item[f.key]).trim()}</p>
      ))}
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
              {m.sometimes ? ' · not always in stock' : ''}
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
    <div className="flex items-center gap-2.5">
      <a
        href={join.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('listing_action', { action: join.field.linkLabel ?? join.field.label })}
        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-emerald-700 px-5 text-[15.5px] font-bold text-white transition-colors hover:bg-emerald-800 sm:max-w-sm"
      >
        <JoinIcon className="h-5 w-5" />
        {joinLabel(join.field, category)}
      </a>
      <ShareButton path={path} name={item.name} round />
    </div>
  ) : (
    <div className={`flex ${buttons.length >= 4 ? 'justify-between' : 'gap-3'}`} data-testid="listing-actions">
      {buttons.map((a) => (
        <ActionButton key={actionKey(a)} action={a} item={item} />
      ))}
      <ShareButton path={path} name={item.name} />
    </div>
  )

  // ── 3 · The main thing ─────────────────────────────────────────────────
  const itemsF = itemsField(category)
  let mainSection: ReactNode = null
  if (main === 'davening') {
    const f = category.detailFields.find((x) => x.type === 'minyanim')!
    mainSection = <DaveningCard item={item} minyanim={item[f.key]} />
  } else if (main === 'items' && itemsF) {
    mainSection = <ItemsCard item={item} field={itemsF} found={found} />
  } else if (main === 'groups') {
    mainSection = <GroupsCard item={item} groups={audienceGroups(item, category)} now={now} candlesAt={candlesAt} />
  } else if (main === 'walk') {
    const walk = parseWalkList(category.walkList)
    mainSection = walk && item.geo ? <WalkList walk={walk} from={item.geo} fromLabel={category.label} /> : null
  } else if (main === 'hours') {
    const f = hoursFields.find((x) => !x.audienceKey && item[x.key] != null)
    mainSection = f ? <HoursCard item={item} value={item[f.key]} now={now} candlesAt={candlesAt} /> : null
  }

  // ── 4 · Details ────────────────────────────────────────────────────────
  const showAddress = category.hasAddress !== false && !!item.address
  const showPhone = category.hasPhone !== false && !!item.phone
  const centreMiles = item.milesFromAddress == null && item.milesFromCenter != null ? item.milesFromCenter : null
  // Hours that aren't the main thing: a grocery's, under its items. One
  // line, opening to the week.
  const otherHours = main === 'hours' || main === 'groups' ? [] : hoursFields.filter((f) => !f.audienceKey && hasAny(item[f.key]))
  const shownElsewhere = new Set<string>([
    ...(tagline ? [tagline.key] : []),
    ...headerAbout.map((f) => f.key),
    ...(join ? [join.field.key] : []),
    ...buttons.flatMap((a) => (a.kind === 'link' || a.kind === 'email' ? [a.field.key] : [])),
    ...extra.flatMap((a) => (a.kind === 'link' || a.kind === 'email' ? [a.field.key] : [])),
  ])
  const aboutFields = category.detailFields.filter(
    (f) => f.type === 'textarea' && !f.audienceKey && !shownElsewhere.has(f.key) && String(item[f.key] ?? '').trim(),
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
  const details = (showAddress || showPhone || otherHours.length > 0 || detailFields.length > 0 || extra.length > 0 || quietBadges.length > 0 || otherTags.length > 0) && (
    <div className="divide-y divide-slate-100 border-t border-slate-100" data-testid="listing-details">
      {showAddress && (
        <Row icon={<PinIcon className="h-[17px] w-[17px]" />}>
          {item.address}
          {centreMiles != null && centreMiles >= 0.5 && (
            <span className="mt-0.5 block text-[13.5px] text-muted">
              {roundMiles(centreMiles)} mi from central {community.region}
            </span>
          )}
        </Row>
      )}
      {showPhone && (
        <Row icon={<PhoneIcon className="h-[17px] w-[17px]" />}>
          <a href={`tel:${item.phone!.replace(/\D/g, '')}`} className="text-primary hover:underline">
            {item.phone}
          </a>
        </Row>
      )}
      {otherHours.map((f) => (
        <Row key={f.key} icon={<ClockIcon className="h-[17px] w-[17px]" />}>
          {otherHours.length > 1 && <span className="block text-xs text-muted">{f.label}</span>}
          <HoursDisplay value={item[f.key]} />
        </Row>
      ))}
      {extra.map((a) => (
        <Row key={actionKey(a)} icon={a.kind === 'email' ? <MailIcon className="h-[17px] w-[17px]" /> : <GlobeIcon className="h-[17px] w-[17px]" />}>
          {a.kind === 'email' ? (
            <a href={`mailto:${a.address}`} className="text-primary hover:underline">{a.address}</a>
          ) : a.kind === 'link' ? (
            <a href={a.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{a.field.linkLabel ?? a.field.label}</a>
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
  )

  // ── 5 · About ──────────────────────────────────────────────────────────
  // A place with no address is its description: it's said under the name,
  // with Join, rather than again down here.
  const about = aboutFields.length > 0 && (
    <div className="space-y-3" data-testid="listing-about">
      {aboutFields.map((f) => (
        <div key={f.key}>
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{String(item[f.key]).trim()}</p>
          {f.key === 'googleDescription' && item.placeId && (
            <p className="mt-1 text-[13px] text-muted">
              {item.googleFields?.includes('description') ? 'Description from Google' : 'Description from the community'}
            </p>
          )}
        </div>
      ))}
    </div>
  )

  const walk = parseWalkList(category.walkList)

  return (
    <div className="space-y-5" data-testid="listing-view">
      {who}
      {foundBox}
      {actions}
      {mainSection}
      {details}
      {about}
      {/* A hotel's walk list is its main thing; anywhere else it follows
          the place's own details, as it always has. */}
      {walk && item.geo && main !== 'walk' && <WalkList walk={walk} from={item.geo} fromLabel={category.label} />}
      {foot}
      {onward && <OnwardSection item={item} category={category} color={color} onward={onward} className={onwardClassName} />}
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
  const frame = aside ? 'rounded-2xl border border-slate-200 px-4 pt-4 pb-4' : '-mx-4 border-t-8 border-slate-100 px-4 pt-5 pb-2'
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
  return isStructuredHours(v) && Object.values(v).some((d) => d != null)
}

function joinLabel(field: CategoryField, category: CategoryConfig): string {
  const label = field.linkLabel ?? field.label
  // "Join group" says less than where the group is.
  return /whatsapp/i.test(category.label) && /^join/i.test(label) ? 'Join the group on WhatsApp' : label
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

function HoursCard({ item, value, now, candlesAt }: { item: DirectoryResource; value: unknown; now: Date | null; candlesAt: number | null }) {
  if (!now) return null
  const fromGoogle = !!item.placeId && item.googleFields?.includes('hours') && item.googleSyncedAt
  return (
    <Card title="Hours" testId="listing-hours" footer={fromGoogle ? `From Google, updated ${shortDate(item.googleSyncedAt!)}` : undefined}>
      <WeekLines value={value} now={now} candlesAt={candlesAt} />
    </Card>
  )
}


const ITEMS_SHOWN = 6

function ItemsCard({ item, field, found }: { item: DirectoryResource; field: CategoryField; found: SearchFound | null }) {
  const [all, setAll] = useState(false)
  const matched = new Set(found?.items.map((m) => m.tag) ?? [])
  const rows = [
    ...selectValues(item[field.key]).map((name) => ({ name, sometimes: false })),
    ...selectValues(item[`${field.key}_sometimes`]).map((name) => ({ name, sometimes: true })),
  ]
  // What the search asked for first, so "See all" can't hide it.
  rows.sort((a, b) => Number(matched.has(b.name)) - Number(matched.has(a.name)))
  const shown = all ? rows : rows.slice(0, ITEMS_SHOWN)
  return (
    <Card title={`${field.label} · ${rows.length}`} testId="listing-items">
      <ul className="divide-y divide-slate-200/70">
        {shown.map((r) => (
          <li key={`${r.sometimes ? 's' : 'a'}:${r.name}`} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className={`text-[15px] font-semibold ${matched.has(r.name) ? 'text-primary-dark' : 'text-slate-900'}`}>
              {r.name}
              {r.sometimes && <span className="ml-1.5 text-[12.5px] font-semibold text-caution">not always in stock</span>}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > ITEMS_SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-[14.5px] font-bold text-primary">
          {all ? 'Fewer' : `All ${rows.length} items`}
          <ChevronRightIcon className={`h-4 w-4 transition-transform ${all ? '-rotate-90' : ''}`} />
        </button>
      )}
    </Card>
  )
}

function GroupsCard({ item, groups, now, candlesAt }: { item: DirectoryResource; groups: AudienceGroup[]; now: Date | null; candlesAt: number | null }) {
  return (
    <Card title="Hours and details, by mikvah" testId="listing-groups">
      <div className="divide-y divide-slate-200">
        {groups.map((g) => (
          <div key={g.key} className="py-2.5">
            <h3 className="text-[15.5px] font-extrabold text-slate-900">{g.label}</h3>
            {g.fields.map((f) => {
              const v = item[f.key]
              if (f.type === 'hours') return now ? <div key={f.key} className="mt-1"><WeekLines value={v} now={now} candlesAt={candlesAt} compact /></div> : null
              if (f.type === 'tel')
                return (
                  <a key={f.key} href={`tel:${String(v).replace(/\D/g, '')}`} className="mt-1.5 block text-[14.5px] font-bold text-primary">
                    {formatPhone(String(v))}
                  </a>
                )
              if (f.type === 'text' && /@/.test(String(v)))
                return (
                  <a key={f.key} href={`mailto:${String(v).trim()}`} className="mt-1.5 block text-[14.5px] font-bold text-primary">
                    {String(v).trim()}
                  </a>
                )
              return <ClampedNote key={f.key} text={String(v).trim()} />
            })}
          </div>
        ))}
      </div>
    </Card>
  )
}

function ClampedNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 160
  return (
    <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-slate-700">
      {long && !open ? `${text.slice(0, 150).trimEnd()}… ` : text}
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="cursor-pointer font-bold text-primary">
          {open ? ' Less' : 'More'}
        </button>
      )}
    </p>
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
  const facts = listingRowFacts({ ...item, milesFromAddress: miles ?? undefined, milesFromCenter: undefined }, category, now, { shul, candlesAt }).map((f) =>
    miles != null && f.text === `${roundMiles(miles)} mi` ? { ...f, text: `${f.text} away` } : f,
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
