'use client'

import { useState } from 'react'

type Props = {
  title: string
  children: React.ReactNode
  /** Render expanded on first paint (the visitor can still collapse it). */
  defaultOpen?: boolean
}

export default function Collapsible({ title, children, defaultOpen = false }: Props) {
  const [isExpanded, setIsExpanded] = useState(defaultOpen)

  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        <span className="text-sm font-semibold uppercase tracking-wide text-muted">
          {title}
        </span>
        <svg
          className={`w-4 h-4 text-muted transition-transform duration-200 shrink-0 ml-4 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50">
          {children}
        </div>
      )}
    </div>
  )
}
