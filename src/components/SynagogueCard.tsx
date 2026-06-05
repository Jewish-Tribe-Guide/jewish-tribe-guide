'use client'

import { Fragment, useState } from 'react'
import type { Synagogue } from '@/types'

type Props = {
  synagogue: Synagogue
}

export default function SynagogueCard({ synagogue }: Props) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* ── Collapsed header (always visible) ──────────────────────────── */}
      <button
        className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{synagogue.name}</p>
            <p className="text-sm text-muted">{synagogue.denomination}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-sm font-medium text-slate-600 whitespace-nowrap">
            {synagogue.distance} mi
          </span>
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
      </button>

      {/* ── Expanded detail panel ──────────────────────────────────────── */}
      {isExpanded && (
        <div className="border-t border-slate-100 px-4 py-5 space-y-5 bg-slate-50">

          {/* 1. Location */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">Location</h3>
            <p className="text-sm text-slate-800">{synagogue.location}</p>
          </section>

          {/* 2. Contacts */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Contacts</h3>
            <ul className="space-y-2">
              {synagogue.contacts.map((c, i) => (
                <li key={i} className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-sm">
                  <span className="font-medium text-slate-900">{c.name}</span>
                  <span className="hidden sm:inline text-slate-300">·</span>
                  <span className="text-muted">{c.role}</span>
                  <span className="hidden sm:inline text-slate-300">·</span>
                  <a
                    href={`tel:${c.phone.replace(/\D/g, '')}`}
                    className="text-primary hover:underline"
                  >
                    {c.phone}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {/* 3. Davening times */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Davening Times</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {synagogue.davening.map((d, i) => (
                <Fragment key={i}>
                  <dt className="text-sm text-muted whitespace-nowrap">{d.label}</dt>
                  <dd className="text-sm font-medium text-slate-800">{d.time}</dd>
                </Fragment>
              ))}
            </dl>
          </section>

          {/* 4. WhatsApp groups */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">WhatsApp Groups</h3>
            <ul className="space-y-1">
              {synagogue.whatsappGroups.map((g, i) => (
                <li key={i}>
                  <a
                    href={g.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    {/* WhatsApp icon */}
                    <svg
                      className="w-4 h-4 text-green-600 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.119.553 4.107 1.521 5.833L.057 23.428a.75.75 0 00.919.913l5.656-1.453A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.7 9.7 0 01-4.95-1.354l-.355-.211-3.655.938.964-3.572-.232-.368A9.713 9.713 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                    </svg>
                    {g.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {/* 5. Shul representative */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">Shul Representative</h3>
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-sm">
              <span className="font-medium text-slate-900">{synagogue.representative.name}</span>
              <span className="hidden sm:inline text-slate-300">·</span>
              <a
                href={`tel:${synagogue.representative.phone.replace(/\D/g, '')}`}
                className="text-primary hover:underline"
              >
                {synagogue.representative.phone}
              </a>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
