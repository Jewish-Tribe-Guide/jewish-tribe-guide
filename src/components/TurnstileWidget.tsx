'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// Cloudflare Turnstile widget. Renders nothing unless NEXT_PUBLIC_TURNSTILE_SITE_KEY
// is set, so forms work normally before the keys are configured (and on preview
// deploys that don't carry the env var). When present, it renders the challenge
// and calls `onVerify` with a token to send in the request body. The token is
// single-use and expires (~5 min), so render the widget close to the submit.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  remove: (id: string) => void
  reset: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export type TurnstileHandle = {
  /** Re-runs the challenge for a fresh token — call this after the server
   *  rejects a submission for a stale/already-used token (see ListingForm's
   *  handleSubmit), so the visitor can just retry without losing their
   *  filled-in form or reloading the page. */
  reset: () => void
}

let scriptPromise: Promise<void> | null = null
function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Turnstile'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

const TurnstileWidget = forwardRef<TurnstileHandle, { onVerify: (token: string) => void }>(
  function TurnstileWidget({ onVerify }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    // Keep the latest callback in a ref so re-renders don't re-mount the widget.
    const cbRef = useRef(onVerify)
    cbRef.current = onVerify
    const widgetId = useRef<string | null>(null)

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetId.current && window.turnstile) {
          try {
            window.turnstile.reset(widgetId.current)
          } catch {
            // widget already gone
          }
        }
      },
    }))

    useEffect(() => {
      if (!SITE_KEY) return
      let cancelled = false
      loadTurnstileScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.turnstile) return
          widgetId.current = window.turnstile.render(containerRef.current, {
            sitekey: SITE_KEY,
            callback: (token: string) => cbRef.current(token),
            'error-callback': () => cbRef.current(''),
            'expired-callback': () => cbRef.current(''),
          })
        })
        .catch((err) => console.error('[turnstile]', err))
      return () => {
        cancelled = true
        if (widgetId.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetId.current)
          } catch {
            // widget already gone
          }
        }
      }
    }, [])

    if (!SITE_KEY) return null
    return <div ref={containerRef} className="my-2" />
  },
)

export default TurnstileWidget
