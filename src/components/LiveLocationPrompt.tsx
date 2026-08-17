'use client'

import { useEffect, useRef, useState } from 'react'

const PROMPT_KEY = 'jpc:live-location-prompt'
// How long to wait before asking again after a "Not now" — not a permanent
// no, since visitors change their mind, but frequent enough re-nagging would
// be annoying on every single visit.
const REASK_AFTER_MS = 3 * 24 * 60 * 60 * 1000

type Props = {
  /** Show only when the feature is on and the visitor isn't already tracking. */
  enabled: boolean
  onShare: () => void
}

/** First-visit (and periodic re-ask) popup offering live, continuously-
 *  updating location — the Google-Maps-style "share your location?" prompt,
 *  shown once per visit instead of relying on the bare browser permission
 *  dialog with no context for why the site wants it. */
export default function LiveLocationPrompt({ enabled, onShare }: Props) {
  const [visible, setVisible] = useState(false)
  // Once the visitor has clicked either button this session, never re-show —
  // `enabled` flips back to true if sharing fails (geolocation errors reset
  // `tracking` to false), and without this guard that would immediately pop
  // the same prompt right back up instead of leaving the error message to
  // speak for itself.
  const interactedRef = useRef(false)

  useEffect(() => {
    if (interactedRef.current) return
    if (!enabled) {
      // Self-correcting: `enabled` can start out true for a render or two
      // before a pending silent auto-resume (see useLiveLocation's
      // `resumingSilently`) has propagated down — effects fire child-before-
      // parent, so this component's very first tick can run before the
      // ancestor effect that will end up setting `enabled` false even has a
      // chance to run. If that already opened the prompt, take it back down
      // the moment the real answer arrives, rather than leaving a stale
      // "share your location?" pitch open once we know tracking was already
      // on and just silently dropped.
      setVisible(false)
      return
    }
    try {
      const raw = localStorage.getItem(PROMPT_KEY)
      const dismissedAt = raw ? Number(raw) : 0
      if (!dismissedAt || Date.now() - dismissedAt > REASK_AFTER_MS) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [enabled])

  if (!visible) return null

  const dismiss = () => {
    interactedRef.current = true
    try {
      localStorage.setItem(PROMPT_KEY, String(Date.now()))
    } catch {
      // Best-effort — worst case we ask again next visit.
    }
    setVisible(false)
  }

  const share = () => {
    interactedRef.current = true
    try {
      localStorage.removeItem(PROMPT_KEY)
    } catch {
      // Best-effort.
    }
    setVisible(false)
    onShare()
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) dismiss() }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Share your live location"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl" aria-hidden="true">
            📍
          </span>
          <h2 className="text-base font-semibold text-slate-900">Share your live location?</h2>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          See distances, directions, and nearby places that update automatically as you walk. You can turn this off anytime from the location pill.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={share}
            className="rounded-lg bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 cursor-pointer"
          >
            Share my location
          </button>
          <button
            onClick={dismiss}
            className="rounded-lg py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
