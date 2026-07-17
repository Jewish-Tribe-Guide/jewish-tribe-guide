'use client'

import { useState } from 'react'
import type { DirectoryResource } from '@/types'
import { resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { isMinyanim, groupByTefillah } from '@/lib/davening'
import type { Minyan } from '@/lib/davening'
import { PencilIcon, FlagIcon } from '@/components/icons'
import { businessUrl } from '@/lib/googleMapsLinks'
import FreshnessFooter from '@/components/resources/FreshnessFooter'
import UpvoteButton from '@/components/resources/UpvoteButton'
import { ui } from '@/lib/uiConfig'

type Props = {
  item: DirectoryResource
  category: CategoryConfig
  /** Seed the expanded state on mount — used to restore the card the user had
   *  open when they navigated into a form and then pressed Back. */
  defaultExpanded?: boolean
  /** Whether upvotes are shown for this category (global switch AND per-category). */
  upvotes?: boolean
  /** Live vote count from the parent directory (optimistic across the list). */
  voteCount?: number
  /** Report the new count back up when the visitor toggles their vote. */
  onVote?: (count: number) => void
  onEdit: () => void
  onReport: () => void
}

// Returns travel chips as separate parts so the card can stack drive/walk
// vertically on mobile (matching the GenericDirectory pattern).
function travelParts(item: DirectoryResource): string[] {
  if (item.milesFromAddress != null) return [`📍 ${item.milesFromAddress} mi`]
  const parts: string[] = []
  if (item.driveMinutes != null) parts.push(`🚗 ${item.driveMinutes} min`)
  if (item.walkMinutes != null) parts.push(`🚶 ${item.walkMinutes} min`)
  return parts
}

// ── Davening sub-components ───────────────────────────────────────────────────

/**
 * Renders structured minyanim grouped by tefillah for a single synagogue card.
 * Each group: label header + day/time grid.
 */
function StructuredDaveningTimes({ minyanim }: { minyanim: Minyan[] }) {
  // Pass as a single-shul array so groupByTefillah handles dedup + sort.
  const groups = groupByTefillah([{ name: '', minyanim }])
  if (groups.length === 0) return null

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.tefillah}>
          <p className="text-xs font-semibold text-muted mb-1">{group.label}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
            {group.rows.flatMap((row, i) => [
              <dt key={`d${i}`} className="text-xs text-muted whitespace-nowrap">
                {row.daysLabel || 'Daily'}
              </dt>,
              <dd key={`v${i}`} className="text-xs font-medium text-slate-800">
                {row.time}
                {row.notes && (
                  <span className="ml-1 font-normal text-muted">({row.notes})</span>
                )}
              </dd>,
            ])}
          </dl>
        </div>
      ))}
    </div>
  )
}

/**
 * Legacy text fallback: parses the flat "Label: time • Label: time" string
 * from the old `davening` text field into a label/time grid.
 */
function LegacyDaveningTimes({ text }: { text: string }) {
  const entries = text
    .split(/\s*•\s*/)
    .map((entry) => {
      const colonIdx = entry.lastIndexOf(':')
      if (colonIdx === -1) return null
      return {
        label: entry.slice(0, colonIdx).trim(),
        time: entry.slice(colonIdx + 1).trim(),
      }
    })
    .filter(Boolean) as { label: string; time: string }[]

  if (entries.length === 0) {
    return <p className="text-sm text-slate-800 whitespace-pre-line">{text}</p>
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {entries.flatMap((d, i) => [
        <dt key={`l${i}`} className="text-sm text-muted whitespace-nowrap">
          {d.label}
        </dt>,
        <dd key={`v${i}`} className="text-sm font-medium text-slate-800">
          {d.time}
        </dd>,
      ])}
    </dl>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

export default function SynagogueCard({
  item,
  category,
  defaultExpanded,
  upvotes,
  voteCount,
  onVote,
  onEdit,
  onReport,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? false)

  // Per-category capabilities layered under the global `ui.contributions` switches.
  const caps = resolveCapabilities(category.capabilities)
  const canEdit = ui.contributions.edit && caps.edit
  const canReport = ui.contributions.report && caps.report
  const count = voteCount ?? (item.upvotes as number | undefined) ?? 0

  const denomination = item.denomination as string | undefined
  const davening = item.davening as string | undefined
  const minyanim = item.minyanim
  const whatsapp = item.whatsapp as string | undefined
  const travel = travelParts(item)

  // Use structured minyanim when available; fall back to legacy text.
  const hasStructuredMinyanim =
    isMinyanim(minyanim) && (minyanim as Minyan[]).length > 0

  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* ── Collapsed header (always visible) ──────────────────────────── */}
      {/* role="button" (not <button>) so the interactive UpvoteButton can nest
          inside it without invalid button-in-button markup — matches the
          generic listing card. */}
      <div
        role="button"
        tabIndex={0}
        className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-slate-50 transition-colors cursor-pointer rounded-t-lg"
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsExpanded((p) => !p) } }}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">
              {item.name}
              {upvotes && (
                <span className="inline-flex align-middle relative -top-0.5 ml-2">
                  <UpvoteButton variant="inline" resourceId={item.id} count={count} onCountChange={onVote} />
                </span>
              )}
            </p>
            {denomination && <p className="text-sm text-muted">{denomination}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {travel.length > 0 && (
            <div className="flex flex-col items-end gap-0.5 text-xs font-medium text-slate-600 whitespace-nowrap">
              {travel.map((t) => <span key={t}>{t}</span>)}
            </div>
          )}
          {/* Chevron */}
          <svg
            className={`w-4 h-4 text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* ── Expanded detail panel ──────────────────────────────────────── */}
      {isExpanded && (
        <div className="border-t border-slate-100 px-4 py-5 space-y-5 bg-slate-50">

          {/* 1. Location */}
          {item.address && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">Location</h3>
              <p className="text-sm text-slate-800">{item.address}</p>
              <a
                href={businessUrl(item.name, item.address, item.placeId as string | undefined)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-1 text-xs font-medium text-primary hover:underline"
              >
                Get directions →
              </a>
            </section>
          )}

          {/* 2. Contact */}
          {item.phone && (
            <section>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Contact</h3>
                {item.placeId && (
                  <span className="text-[10px] font-medium text-slate-400 border border-slate-200 rounded px-1 py-0.5 leading-none">via Google</span>
                )}
              </div>
              <a
                href={`tel:${String(item.phone).replace(/\D/g, '')}`}
                className="text-sm text-primary hover:underline"
              >
                {String(item.phone)}
              </a>
            </section>
          )}

          {/* 3. Davening times — structured preferred, legacy text fallback */}
          {hasStructuredMinyanim ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Davening Times</h3>
              <StructuredDaveningTimes minyanim={minyanim as Minyan[]} />
            </section>
          ) : davening ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Davening Times</h3>
              <LegacyDaveningTimes text={davening} />
            </section>
          ) : null}

          {/* 4. WhatsApp group */}
          {whatsapp && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">WhatsApp Group</h3>
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                {/* WhatsApp brand icon */}
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.119.553 4.107 1.521 5.833L.057 23.428a.75.75 0 00.919.913l5.656-1.453A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.7 9.7 0 01-4.95-1.354l-.355-.211-3.655.938.964-3.572-.232-.368A9.713 9.713 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                </svg>
                Join WhatsApp group
              </a>
            </section>
          )}

          {/* Footer: freshness + edit / report */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} />
            {(canEdit || canReport) && (
              <div className="flex gap-3">
                {canEdit && (
                  <button onClick={onEdit} className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors cursor-pointer">
                    <PencilIcon className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
                {canReport && (
                  <button onClick={onReport} className="inline-flex items-center gap-1 text-xs text-muted hover:text-red-600 transition-colors cursor-pointer">
                    <FlagIcon className="h-3.5 w-3.5" /> Report
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
