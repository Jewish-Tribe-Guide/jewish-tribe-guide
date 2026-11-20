'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

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
   *  rejects a submission for a stale/already-used token (see
   *  useListingSubmit's submit), so the visitor can just retry without losing their
   *  filled-in form or reloading the page. */
  reset: () => void
}

// When the check doesn't come (Nov 20, the health sweep): a blocked or
// failed script used to leave the form without a word, its Send waiting on
// a token that would never arrive, and the failed load was kept, so nothing
// short of a reload could try again. Now the visitor is told, with a Try
// again, after a failed load, a script still not there after LOAD_WAIT_MS,
// or a challenge Cloudflare says went wrong.

/** How long the script may take before the visitor is told. */
export const LOAD_WAIT_MS = 10_000

let scriptPromise: Promise<void> | null = null
export function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => {
      // Forgotten, so Try again fetches it again rather than the failure.
      s.remove()
      scriptPromise = null
      reject(new Error('Failed to load Turnstile'))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

type Props = {
  onVerify: (token: string) => void
  /** 'interaction-only' shows nothing unless Cloudflare wants the visitor
   *  to click (a photo upload's challenge, which runs beside a form that
   *  already shows one). Default: Cloudflare's own, always shown. */
  appearance?: 'interaction-only'
}

const TurnstileWidget = forwardRef<TurnstileHandle, Props>(
  function TurnstileWidget({ onVerify, appearance }, ref) {
    const appearanceRef = useRef(appearance)
    const containerRef = useRef<HTMLDivElement>(null)
    // Keep the latest callback in a ref so re-renders don't re-mount the widget.
    const cbRef = useRef(onVerify)
    cbRef.current = onVerify
    const widgetId = useRef<string | null>(null)
    const [trouble, setTrouble] = useState<'load' | 'challenge' | null>(null)
    const cancelled = useRef(false)

    const mount = useCallback(() => {
      if (!SITE_KEY) return
      setTrouble(null)
      const late = setTimeout(() => {
        if (!cancelled.current && !widgetId.current) setTrouble('load')
      }, LOAD_WAIT_MS)
      loadTurnstileScript()
        .then(() => {
          clearTimeout(late)
          if (cancelled.current || !containerRef.current || !window.turnstile || widgetId.current) return
          setTrouble(null)
          widgetId.current = window.turnstile.render(containerRef.current, {
            sitekey: SITE_KEY,
            callback: (token: string) => {
              setTrouble(null)
              cbRef.current(token)
            },
            'error-callback': () => {
              setTrouble('challenge')
              cbRef.current('')
            },
            'expired-callback': () => cbRef.current(''),
            ...(appearanceRef.current ? { appearance: appearanceRef.current } : {}),
          })
        })
        .catch((err) => {
          clearTimeout(late)
          console.error('[turnstile]', err)
          if (!cancelled.current) setTrouble('load')
        })
    }, [])

    const tryAgain = () => {
      if (widgetId.current && window.turnstile) {
        setTrouble(null)
        try {
          window.turnstile.reset(widgetId.current)
        } catch {
          // widget already gone
        }
      } else {
        mount()
      }
    }

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
      cancelled.current = false
      mount()
      return () => {
        cancelled.current = true
        if (widgetId.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetId.current)
          } catch {
            // widget already gone
          }
        }
        widgetId.current = null
      }
    }, [mount])

    if (!SITE_KEY) return null
    // No margin when it only shows for an interaction: an empty box would
    // still push the field below it down.
    return (
      <>
        <div ref={containerRef} className={appearance ? undefined : 'my-2'} />
        {trouble && (
          <p role="alert" className="my-2 text-sm text-slate-700">
            The spam check didn’t load.{' '}
            <button type="button" onClick={tryAgain} className="cursor-pointer font-medium text-primary underline">
              Try again
            </button>
          </p>
        )}
      </>
    )
  },
)

export default TurnstileWidget
