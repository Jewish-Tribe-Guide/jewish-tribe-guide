'use client'

import type { DirectoryResource } from '@/types'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { isStructuredHours, hoursOpenNow, hoursClosing } from '@/lib/hours'
import HoursDisplay from '@/components/resources/HoursDisplay'
import DaveningTimes, { hasDaveningTimes } from '@/components/resources/DaveningTimes'
import Chip from '@/components/resources/Chip'
import { businessUrl } from '@/lib/googleMapsLinks'
import { ChevronLeftIcon, PinIcon, PhoneIcon, ClockIcon, DirectionsIcon, ExternalIcon } from '@/components/icons'

// ── Field helpers (same rules GenericListingCard uses, so a place looks
// identical whether you found it from the map or the category directory) ──

function placement(field: CategoryField): 'badge' | 'row' | 'hidden' {
  return field.renderAs ?? (field.type === 'boolean' ? 'badge' : 'row')
}

function display(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return ''
  return String(value)
}

function asTags(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : []
}

/** A round icon button with a label underneath — the Directions/Call/Website
 *  action row, styled after Google Maps' place-card action buttons. */
function ActionButton({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center gap-1 text-primary"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 hover:bg-primary/15 transition-colors">
        {icon}
      </span>
      <span className="text-xs font-medium">{label}</span>
    </a>
  )
}

type Props = {
  item: DirectoryResource
  category: CategoryConfig
  glyph?: string
  color: string
  onBack: () => void
}

/**
 * Full place details shown inline in the mobile map's bottom sheet — the
 * Google-Maps-style alternative to navigating away to the category
 * directory. Shows everything GenericListingCard does (hours, tags, badges,
 * davening times, freeform fields, caveat notes) except Edit/Report/upvote,
 * which stay a tap away in the full listing for now.
 */
export default function MapPlaceDetail({ item, category, glyph, color, onBack }: Props) {
  const fields = category.detailFields
  const tagFields = fields.filter((f) => f.type === 'tags')
  const urlFields = fields.filter((f) => f.type === 'url')
  const hoursFields = fields.filter((f) => f.type === 'hours')
  const minyanimField = fields.find((f) => f.type === 'minyanim')
  const special = (f: CategoryField) => f.type === 'tags' || f.type === 'url' || f.type === 'hours' || f.type === 'minyanim'
  const badgeFields = fields.filter((f) => !special(f) && placement(f) === 'badge')
  const rowFields = fields.filter((f) => !special(f) && placement(f) === 'row')

  const minyanimValue = minyanimField ? item[minyanimField.key] : undefined
  const legacyDavening = item.davening as string | undefined
  const showDavening = hasDaveningTimes(minyanimValue, legacyDavening)

  const openHoursVal = hoursFields
    .map((f) => item[f.key])
    .find((v) => v !== undefined && hoursOpenNow(v) === true && isStructuredHours(v))
  const isOpen = openHoursVal !== undefined
  const closing = isOpen ? hoursClosing(openHoursVal) : null
  const anyHoursVal = hoursFields.some((f) => item[f.key] !== undefined)

  const tags = tagFields.flatMap((f) => asTags(item[f.key]))
  const tagsSometimes = tagFields.flatMap((f) => asTags(item[f.key + '_sometimes']))

  const signalBadges = badgeFields.filter((f) =>
    f.type === 'boolean' ? !!item[f.key] : f.type === 'select' ? !!item[f.key] : false,
  )
  const detailBadges = badgeFields.filter((f) => !signalBadges.includes(f))

  const caveatNote = (f: CategoryField): string | null => {
    if (!f.caveat || !item[f.caveat.flagField]) return null
    return String(item[f.caveat.noteField] ?? '').trim()
  }

  const showAddress = category.hasAddress !== false && !!item.address
  const showPhone = category.hasPhone !== false && !!item.phone
  const website = urlFields.map((f) => display(item[f.key])).find(Boolean)

  return (
    <div className="space-y-4 pb-2">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Back to list
      </button>

      {/* ── Header: icon, name, category ─────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl"
          style={{ backgroundColor: color + '22' }}
          aria-hidden="true"
        >
          {glyph ?? '📍'}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-lg font-bold leading-tight text-slate-900">{item.name}</h2>
          <p className="text-sm text-muted">{category.label}</p>
        </div>
      </div>

      {/* ── Status + signal badges ───────────────────────────────────────── */}
      {(isOpen || signalBadges.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {isOpen && (
            <Chip tone={closing?.closesSoon ? 'greenSolid' : 'green'}>
              {closing?.closesSoon ? 'Closes Soon' : 'Open'}
            </Chip>
          )}
          {signalBadges.map((f) => {
            const text = f.type === 'select' ? String(item[f.key]) : (f.filterLabel ?? f.label)
            const note = caveatNote(f)
            return (
              <Chip key={f.key} tone={note !== null ? 'amber' : 'slate'}>
                {text}
              </Chip>
            )
          })}
        </div>
      )}

      {/* ── Action row: Directions / Call / Website ──────────────────────── */}
      <div className="flex gap-6 border-y border-slate-100 py-3">
        <ActionButton
          href={businessUrl(item.name, item.address, item.placeId as string | undefined)}
          icon={<DirectionsIcon className="h-5 w-5" />}
          label="Directions"
        />
        {showPhone && (
          <ActionButton
            href={`tel:${item.phone!.replace(/\D/g, '')}`}
            icon={<PhoneIcon className="h-5 w-5" />}
            label="Call"
          />
        )}
        {website && (
          <ActionButton href={website} icon={<ExternalIcon className="h-5 w-5" />} label="Website" />
        )}
      </div>

      {/* ── Address / phone / hours / davening ───────────────────────────── */}
      <div className="space-y-3">
        {showAddress && (
          <div className="flex items-start gap-3">
            <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-800">{item.address}</p>
          </div>
        )}

        {showPhone && (
          <div className="flex items-center gap-3">
            <PhoneIcon className="h-4 w-4 shrink-0 text-slate-400" />
            <a href={`tel:${item.phone!.replace(/\D/g, '')}`} className="text-sm text-primary hover:underline">
              {item.phone}
            </a>
            {item.placeId && !anyHoursVal && (
              <span className="text-[10px] font-medium text-slate-400 border border-slate-200 rounded px-1 py-0.5 leading-none">
                via Google
              </span>
            )}
          </div>
        )}

        {showDavening && (
          <div>
            <p className="text-xs text-muted mb-1">Davening Times</p>
            <DaveningTimes minyanim={minyanimValue} legacyText={legacyDavening} />
          </div>
        )}

        {hoursFields.map((f, i) => {
          const val = item[f.key]
          if (val === undefined && !(i === 0 && item.businessStatus)) return null
          return (
            <div key={f.key} className="flex items-start gap-3">
              <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                {hoursFields.length > 1 && <p className="text-xs text-muted mb-0.5">{f.label}</p>}
                <HoursDisplay
                  value={val}
                  businessStatus={i === 0 ? item.businessStatus : undefined}
                  syncedAt={i === 0 ? item.googleSyncedAt : undefined}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Tags ──────────────────────────────────────────────────────────── */}
      {(tags.length > 0 || tagsSometimes.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Chip key={t} tone="slate" size="expanded">{t}</Chip>
          ))}
          {tagsSometimes.map((t) => (
            <Chip key={`sometimes:${t}`} tone="amber" size="expanded">~{t}</Chip>
          ))}
        </div>
      )}
      {tagsSometimes.length > 0 && (
        <p className="text-[11px] text-amber-700">~ = not always in stock — call ahead</p>
      )}

      {/* ── Other detail fields ──────────────────────────────────────────── */}
      {detailBadges.some((f) => (f.type === 'boolean' ? item[f.key] : display(item[f.key]))) && (
        <div className="flex flex-wrap gap-1.5">
          {detailBadges.map((f) => {
            const v = item[f.key]
            if (f.type === 'boolean' ? !v : !display(v)) return null
            const text = f.type === 'boolean' ? f.label : `${f.label}: ${display(v)}`
            return <Chip key={f.key} tone="slate" size="expanded">{text}</Chip>
          })}
        </div>
      )}

      {rowFields.map((f) => {
        const v = display(item[f.key])
        if (!v) return null
        return (
          <p key={f.key} className="text-sm text-slate-700">
            {!f.hideLabel && <span className="text-muted">{f.label}: </span>}
            {v}
          </p>
        )
      })}

      {/* Not-fully-kosher caveat notes */}
      {signalBadges.map((f) => {
        const note = caveatNote(f)
        if (note === null) return null
        return (
          <p key={`caveat:${f.key}`} className="text-[12px] leading-snug text-amber-700">
            {note || 'Not everything here is kosher — please verify.'}
          </p>
        )
      })}
    </div>
  )
}
