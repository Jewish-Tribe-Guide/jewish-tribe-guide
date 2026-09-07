import Link from 'next/link'

type Props = {
  /** The ancestor a visitor can go up to, e.g. "Home" or "Childcare" — same
   *  wording as the UpButton this pairs with on every screen that has one. */
  upLabel: string
  /** The current screen's own name, e.g. "Add a Childcare" — shown as plain,
   *  non-interactive text after the separator, since it's where you already are. */
  title: string
  /** Override the default bottom margin (mb-2). */
  className?: string
} & (
  | { onUp: () => void; href?: never }
  /** A real href instead of a handler — for a screen that goes up by
   *  navigating rather than by changing in-app state (About, Privacy: plain
   *  server-rendered routes with no client-side "up" state to call into).
   *  Same discriminated-union shape as UpButton's own onClick/href split,
   *  for the same reason. */
  | { href: string; onUp?: never }
)

// Desktop-only two-segment breadcrumb ("{upLabel} / {title}") — names both
// where a visitor can go back to AND where they already are, unlike
// UpButton's plain "‹ {label}" (which only ever says the former). Started
// as DirectoryHeader's own inline block for category directory pages;
// factored out here so every second-level screen shows the same thing —
// About, Privacy, Add/Edit/Report — instead of only directories getting the
// richer wording.
//
// Desktop-only (`hidden desktop:flex`) by design, meant to sit beside the
// caller's own UpButton hidden on desktop (`desktop:hidden`): the two name
// the same destination, so showing both at once would just repeat it — which
// one earns the space is a breakpoint question, not a content one. A caller
// that wants this needs both halves; see About's page for the pairing.
export default function Breadcrumb({ upLabel, title, onUp, href, className }: Props) {
  const linkClasses = 'text-muted hover:text-slate-700 transition-colors cursor-pointer'

  return (
    <div className={`hidden desktop:flex items-center gap-1 text-sm ${className ?? 'mb-2'}`}>
      {href ? (
        <Link href={href} className={linkClasses}>
          {upLabel}
        </Link>
      ) : (
        <button type="button" onClick={onUp} className={linkClasses}>
          {upLabel}
        </button>
      )}
      <span aria-hidden="true" className="text-muted mx-0.5">/</span>
      <span className="text-slate-700">{title}</span>
    </div>
  )
}
