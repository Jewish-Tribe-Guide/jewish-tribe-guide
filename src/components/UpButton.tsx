type Props = {
  /** The destination this button goes to, e.g. "All resources" or "Synagogues".
   *  Rendered after a left chevron as "← {label}" so the user always knows where
   *  Up leads — distinct from the browser/trackpad Back, which is temporal. */
  label: string
  onClick: () => void
  /** Override the default bottom margin (mb-4). e.g. "mb-6" for home screens. */
  className?: string
}

// The single on-screen navigation control: a hierarchical "Up" button that goes
// to the parent of the current screen (named by `label`), independent of browser
// history. Browser/trackpad Back stays temporal; this never calls history.back().
export default function UpButton({ label, onClick, className }: Props) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-sm text-muted hover:text-slate-700 cursor-pointer transition-colors ${className ?? 'mb-4'}`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  )
}
