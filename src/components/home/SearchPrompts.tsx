'use client'

// A few questions to tap under the search box (see searchPrompts.ts): the
// first try at search, made one that works. Each fills the box and shows its
// answer, the same as typing it.
export default function SearchPrompts({
  prompts,
  onPick,
  className = '',
  oneRow = false,
}: {
  prompts: string[]
  onPick: (prompt: string) => void
  className?: string
  /** One row that scrolls sideways (the Today home on a phone), rather than
   *  wrapping onto as many rows as it takes. */
  oneRow?: boolean
}) {
  if (prompts.length === 0) return null
  return (
    <div
      className={`flex items-center gap-2 ${oneRow ? '-mr-4 overflow-x-auto pr-4 [scrollbar-width:none] [&>*]:shrink-0 [&>*]:whitespace-nowrap' : 'flex-wrap'} ${className}`}
      data-testid="search-prompts"
    >
      <span className="text-[13px] font-medium text-slate-500">Try asking</span>
      {prompts.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          className="cursor-pointer rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13.5px] font-medium text-ink shadow-sm transition-colors hover:border-primary/50 hover:text-primary-dark"
        >
          {p}
        </button>
      ))}
    </div>
  )
}
