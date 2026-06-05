'use client'

import { useState } from 'react'
import { synagogues } from '@/data/synagogues'
import SynagogueCard from '@/components/SynagogueCard'

type Props = {
  hospitalId: string
  hospitalName: string
  onBack: () => void
}

export default function Synagogues({ hospitalId, hospitalName, onBack }: Props) {
  const [denomination, setDenomination] = useState('All')

  const nearby = synagogues
    .filter((s) => s.hospitalId === hospitalId)
    .sort((a, b) => a.distance - b.distance)

  const denominations = ['All', ...Array.from(new Set(nearby.map((s) => s.denomination)))]

  const filtered = denomination === 'All'
    ? nearby
    : nearby.filter((s) => s.denomination === denomination)

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted hover:text-slate-700 mb-4 cursor-pointer transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Option-3 heading */}
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Synagogues</h2>
          <p className="text-sm text-muted mt-0.5">{hospitalName}</p>
        </div>
        {denominations.length > 2 && (
          <div className="flex items-center gap-2">
            <label htmlFor="denom-filter" className="text-sm text-muted whitespace-nowrap">
              Denomination
            </label>
            <select
              id="denom-filter"
              value={denomination}
              onChange={(e) => setDenomination(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              {denominations.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {nearby.length === 0 ? (
        <p className="text-muted">No synagogues listed for this hospital yet.</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted text-sm">No {denomination} synagogues listed for this hospital.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <SynagogueCard key={s.id} synagogue={s} />
          ))}
        </div>
      )}
    </div>
  )
}
