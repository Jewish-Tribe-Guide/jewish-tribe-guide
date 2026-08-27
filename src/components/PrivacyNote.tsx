import Link from 'next/link'

/** The one-line "here's what happens to what you just typed" note, shown by
 *  every form that collects a name, phone, or email — the intake wizard, the
 *  feedback form, and the add/edit listing form.
 *
 *  This is where the privacy policy belongs, and for a while it was the one
 *  place it wasn't: the only links to /privacy in the whole app lived in the
 *  footer, which is desktop-only, so a phone visitor typing their number into
 *  a support request had no route to it at all. Even on desktop, a policy
 *  reachable only by scrolling to the bottom of a different page is not
 *  reachable at the moment it's relevant.
 *
 *  Deliberately not a consent checkbox. Nothing here is opt-in processing —
 *  the forms exist so a volunteer can reply to the person who filled one in,
 *  which is exactly what the policy says — and a checkbox would imply a
 *  choice that isn't being offered while adding a step to the one flow we
 *  most want completed.
 */
export default function PrivacyNote({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-muted ${className}`}>
      We use what you send only to respond to it — never for marketing, and never sold. See our{' '}
      {/* Opens in a new tab, unlike most internal links: this sits inside a
          part-filled form, and navigating away in place would throw the
          answers away. */}
      <Link
        href="/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-slate-600"
      >
        privacy policy
      </Link>
      .
    </p>
  )
}
