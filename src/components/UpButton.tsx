import Link from 'next/link'

type Props = {
  /** The destination this button goes to, e.g. "All resources" or "Synagogues".
   *  Rendered after a left chevron as "← {label}" so the user always knows where
   *  Up leads — distinct from the browser/trackpad Back, which is temporal. */
  label: string
  /** Override the default bottom margin (mb-4). e.g. "mb-6" for home screens. */
  className?: string
} & (
  | { onClick: () => void; href?: never }
  /** A real href instead of a handler, for a screen that goes up by
   *  navigating rather than by changing in-app state — /about and /privacy,
   *  which are plain server-rendered routes outside the community segment and
   *  have no client-side navigation to call. They used to hand-roll their own
   *  "← Back to {community}" link, which drifted from this control in both
   *  wording and appearance (underlined, an arrow instead of the chevron, and
   *  naming the destination differently from every other screen). Same markup
   *  either way, so the two can't drift again. */
  | { href: string; onClick?: never }
)

// The single on-screen navigation control: a hierarchical "Up" button that goes
// to the parent of the current screen (named by `label`), independent of browser
// history. Browser/trackpad Back stays temporal; this never calls history.back().
export default function UpButton({ label, onClick, href, className }: Props) {
  const classes = `flex items-center gap-1 text-sm text-muted hover:text-slate-700 cursor-pointer transition-colors ${className ?? 'mb-4'}`
  const inner = (
    <>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={classes}>
        {inner}
      </Link>
    )
  }
  return (
    <button onClick={onClick} className={classes}>
      {inner}
    </button>
  )
}
