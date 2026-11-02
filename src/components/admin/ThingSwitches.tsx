'use client'

// Everything waiting at one place, as switches over what's open (the "one
// tap per place" boards, Nov 2): the one shown is white, one answered is
// ticked and struck through. Four or more scroll sideways, a fade at the
// edge saying there's more.

export type Thing = { id: string; label: string; done?: boolean }

export default function ThingSwitches({ things, on, onPick }: { things: Thing[]; on: string; onPick: (id: string) => void }) {
  if (things.length < 2) return null
  const scrolls = things.length >= 4
  return (
    <div className="relative">
      <div role="tablist" aria-label="Waiting here" className={`flex gap-1 p-1 bg-slate-200 rounded-[11px] ${scrolls ? 'overflow-x-auto [scrollbar-width:none]' : ''}`}>
        {things.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === on}
            onClick={() => onPick(t.id)}
            className={`${scrolls ? 'flex-none px-3' : 'flex-1 min-w-0 px-2'} min-h-[38px] flex items-center justify-center gap-1.5 rounded-lg text-[13.5px] font-bold cursor-pointer ${
              t.id === on ? 'bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.12)]' : 'text-slate-600'
            }`}
          >
            {t.done && (
              <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 flex-none text-slate-500">
                <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span className={`${scrolls ? 'whitespace-nowrap' : 'truncate'} ${t.done ? 'line-through text-slate-500' : ''}`}>
              {t.label}
              {t.done && <span className="sr-only"> (done)</span>}
            </span>
          </button>
        ))}
      </div>
      {scrolls && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-[11px] bg-gradient-to-l from-slate-200 to-transparent" />}
    </div>
  )
}
