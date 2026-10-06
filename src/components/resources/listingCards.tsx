'use client'

import { useContext, type ReactNode } from 'react'
import type { DirectoryResource, ZmanimData } from '@/types'
import { selectValues, type CategoryConfig, type CategoryField } from '@/lib/categories'
import { useCategories } from '@/lib/useCategories'
import { useActiveCommunity } from '@/lib/communityContext'
import { formatPhone } from '@/lib/validation'
import { clockTime } from '@/lib/upcomingDavening'
import { walkDistanceText, walkMinutes } from '@/lib/walkList'
import { haversineMiles, type LatLng } from '@/lib/geo'
import { eruvim } from '@/data/resources'
import { CheckIcon, PhoneIcon } from '@/components/icons'
import { Card } from './listingParts'
import { NextMinyans, NextMinyansContext } from './nextMinyans'
import { usePlaces } from './WalkList'

// ── Cards an admin adds to a category's opened listings (listingParts.ts) ──

/** What a field holds, as words: a pick-list's labels, a yes/no's label,
 *  the text. Empty when it holds nothing. */
function fieldText(f: CategoryField, v: unknown): string {
  if (f.type === 'boolean') return v === true ? (f.filterLabel ?? f.label) : ''
  if (f.type === 'select') return selectValues(v).map((x) => f.options?.find((o) => o.value === x)?.label ?? x).join(', ')
  if (f.type === 'tel') return String(v ?? '').trim() ? formatPhone(String(v)) : ''
  return String(v ?? '').trim()
}

const NOT_YET = 'Not in the guide yet.'

// ── The named main thing: "Who to call first" ───────────────────────────────

/** One form section, as the listing's main thing. Its first line of text
 *  leads ("Bikur Cholim of Philadelphia"); longer text follows as it was
 *  written; a phone is a Call button named after that first line. A section
 *  nobody has filled in yet says so, rather than leaving a gap where the
 *  page's first answer should be. */
export function SectionCard({
  item,
  title,
  fields: all,
  footer,
}: {
  item: DirectoryResource
  title: string
  fields: readonly CategoryField[]
  footer?: ReactNode
}) {
  // A card that leads with a yes/no is about it (a hotel's "Shabbos
  // friendly", Oct 6): shown only for a yes with something more to say, and
  // the yes isn't said again inside; the title and the header's facts say
  // it. No card at all for a no, or a hotel that doesn't say.
  const gate = all[0]?.type === 'boolean' ? all[0] : null
  const fields = gate ? all.slice(1) : all
  if (gate && (item[gate.key] !== true || !fields.some((f) => fieldText(f, item[f.key])))) return null
  const filled = fields.filter((f) => fieldText(f, item[f.key]))
  const lead = filled.find((f) => f.type === 'text')
  const leadText = lead ? fieldText(lead, item[lead.key]) : ''
  const parts: ReactNode[] = []
  for (const f of filled) {
    const text = fieldText(f, item[f.key])
    if (f === lead) {
      parts.push(
        <p key={f.key} className="text-[16px] font-bold text-slate-900">
          {text}
        </p>,
      )
    } else if (f.type === 'tel') {
      parts.push(
        <a
          key={f.key}
          href={`tel:${String(item[f.key]).replace(/\D/g, '')}`}
          className="mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15.5px] font-bold text-white hover:bg-primary-dark"
        >
          <PhoneIcon className="h-5 w-5" />
          Call {leadText || text}
        </a>,
      )
    } else if (f.type === 'url') {
      parts.push(
        <a key={f.key} href={text} target="_blank" rel="noopener noreferrer" className="mt-1.5 block text-[15px] font-semibold text-primary hover:underline">
          {f.linkLabel ?? f.label}
        </a>,
      )
    } else if (f.type === 'boolean') {
      // Said once, ticked ("✓ Shabbat friendly"), not "Shabbat friendly:
      // Shabbat friendly".
      parts.push(
        <p key={f.key} className="mt-1 flex items-center gap-2 text-[15px] font-semibold text-slate-900">
          <CheckIcon className="h-4 w-4 shrink-0 text-emerald-700" />
          {text}
        </p>,
      )
    } else if (f.type === 'textarea') {
      parts.push(
        <p key={f.key} className="mt-1 whitespace-pre-line text-[15px] leading-snug text-slate-700">
          {text}
        </p>,
      )
    } else {
      parts.push(
        <p key={f.key} className="mt-1 text-[15px] leading-snug text-slate-700">
          {!f.hideLabel && <span className="text-muted">{f.label}: </span>}
          {text}
        </p>,
      )
    }
  }
  // Nothing to confirm on a card nobody has filled in.
  return (
    <Card title={title} testId="listing-section" footer={parts.length > 0 ? footer : undefined}>
      {parts.length > 0 ? parts : <p className="text-[15px] text-slate-600">{NOT_YET}</p>}
    </Card>
  )
}

// ── This Shabbos ────────────────────────────────────────────────────────────

/** "6:13 PM tonight" on a day with candles; otherwise Friday's. */
function candleText(zmanim: ZmanimData | null, candlesAt: number | null): string | null {
  if (candlesAt !== null) return `${clockTime(candlesAt)} tonight`
  const next = zmanim?.shabbos.candleLighting
  return next ? `${next.label} ${next.time}` : null
}

/** A ticked field's line. A pick-list value that names an eruv on the
 *  guide's eruv page links to that eruv's own status, which it posts each
 *  week; the guide only knows what the eruv page says. */
function ShabbosField({ field, item }: { field: CategoryField; item: DirectoryResource }) {
  const text = fieldText(field, item[field.key])
  const eruv = field.type === 'select' ? eruvim.find((e) => text.toLowerCase() === e.name.toLowerCase()) : undefined
  return (
    <Line label={field.label}>
      {text ? (
        <>
          <span className={field.type === 'select' || field.type === 'boolean' ? 'font-semibold text-slate-900' : 'whitespace-pre-line'}>{text}</span>
          {eruv && (
            <>
              {' · '}
              <a href={eruv.statusLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
                This week’s status ↗
              </a>
            </>
          )}
        </>
      ) : (
        <span className="text-slate-600">{NOT_YET}</span>
      )}
    </Line>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-slate-200 py-2 first:border-t-0">
      <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-[15px] leading-snug text-slate-700">{children}</p>
    </div>
  )
}

/** The nearest shul with a minyan coming up, from where the listing is, in
 *  the Synagogues page's own words ("Mincha & Maariv 7 PM"). */
function NearestMinyan({ shuls, places, from }: { shuls: CategoryConfig; places: DirectoryResource[]; from: LatLng }) {
  return (
    <NextMinyans enabled items={places}>
      <NearestMinyanLine shuls={shuls} places={places} from={from} />
    </NextMinyans>
  )
}

function NearestMinyanLine({ shuls, places, from }: { shuls: CategoryConfig; places: DirectoryResource[]; from: LatLng }) {
  const minyans = useContext(NextMinyansContext)
  const nearest = places
    .filter((p) => p.geo && minyans[p.id]?.tone === 'minyan')
    .map((p) => ({ item: p, miles: haversineMiles(from, p.geo!), minutes: walkMinutes(from, p.geo!) }))
    .sort((a, b) => a.miles - b.miles)[0]
  // Nothing said until the times are worked out: "none" might not be true.
  if (Object.keys(minyans).length === 0) return null
  return (
    <Line label="Nearest minyan">
      {nearest ? (
        <>
          <span className="font-semibold text-slate-900">{nearest.item.name}</span>, {walkDistanceText(nearest)} · {minyans[nearest.item.id].text}
        </>
      ) : (
        <span className="text-slate-600">No {shuls.label.toLowerCase()} in the guide has a minyan coming up.</span>
      )}
    </Line>
  )
}

/** Candle lighting, the nearest minyan, and the fields the admin ticked
 *  (the eruv, kosher food inside, staying over). */
export function ShabbosCard({
  item,
  fields,
  zmanim,
  candlesAt,
}: {
  item: DirectoryResource
  fields: readonly CategoryField[]
  zmanim: ZmanimData | null
  /** Tonight's candle lighting, on a Friday or Erev Yom Tov. */
  candlesAt: number | null
}) {
  const { community } = useActiveCommunity()
  const shuls = useCategories().find((c) => c.kind === 'listing' && c.detailFields.some((f) => f.type === 'minyanim'))
  const places = usePlaces(shuls && item.geo ? [shuls.id] : [])
  const shulPlaces = shuls ? places[shuls.id] : null
  const candles = candleText(zmanim, candlesAt)
  const yomTov = candlesAt !== null && zmanim !== null && zmanim.dayOfWeek !== 5
  return (
    <Card title={yomTov ? 'Yom Tov tonight' : 'This Shabbos'} testId="listing-shabbos">
      <div>
        {candles && (
          <Line label="Candle lighting">
            <span className="font-semibold text-slate-900">{candles}</span>, for {community.region}
          </Line>
        )}
        {fields.map((f) => (
          <ShabbosField key={f.key} field={f} item={item} />
        ))}
        {shuls && item.geo && Array.isArray(shulPlaces) && <NearestMinyan shuls={shuls} places={shulPlaces} from={item.geo} />}
      </div>
    </Card>
  )
}
