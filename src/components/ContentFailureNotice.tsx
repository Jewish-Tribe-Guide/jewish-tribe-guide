'use client'

import { useContentFailures } from '@/lib/contentContext'

// ─────────────────────────────────────────────────────────────────────────────
// Says so when part of the page is a fallback rather than real data.
//
// Without this, a failed read is indistinguishable from a true empty result —
// the exact failure worth avoiding here. Someone deciding where to eat needs
// "we couldn't check" and "there are none" to look different, because they act
// on them differently: one means try again, the other means go elsewhere.
//
// Deliberately a quiet strip rather than a blocking dialog. The rest of the
// page is usually still useful — a categories failure leaves the seeded cards,
// which are mostly right — so this informs without getting in the way.
// ─────────────────────────────────────────────────────────────────────────────

const LABELS: Record<string, string> = {
  categories: 'the list of categories',
  settings: 'some site text',
  homeSections: 'the section grouping',
  forms: 'the request forms',
  hospitals: 'the hospital list',
}

export default function ContentFailureNotice() {
  const failed = useContentFailures()
  if (failed.length === 0) return null

  const names = failed.map((k) => LABELS[k] ?? k)
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
    >
      We couldn’t load {list} just now, so some of this page may be out of date.{' '}
      <button
        onClick={() => window.location.reload()}
        className="font-medium underline underline-offset-2 cursor-pointer"
      >
        Try again
      </button>
    </div>
  )
}
