'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useIsMobile } from '@/lib/useIsMobile'

// Wraps a preview in a full-viewport overlay with a Desktop/Mobile toggle, so
// "what does this look like" isn't stuck at the admin shell's ~768px content
// width (skinnier than any real desktop) and mobile has a way to be seen at
// all.
//
// The device frame is a real <iframe>, not just a resized <div>: Tailwind's
// `sm:` classes (and every other responsive rule in the app) are ordinary CSS
// media queries keyed off the actual rendering viewport, which for anything
// on the page is the browser window — a narrower wrapper div has zero effect
// on them. An iframe gets its own independent viewport equal to its own
// rendered size, so putting the preview inside one makes those breakpoints
// respond to the frame's width for real (the mobile-collapsed filter row,
// smaller heading sizes, hidden header logo, etc. all correctly kick in).
//
// The preview content is portaled into the iframe's own document (via
// createPortal) rather than pointed at a URL, so it stays the exact same
// live React tree/state as everywhere else in the app — no separate route,
// no serializing the draft across a navigation.

type Device = 'desktop' | 'mobile'

const WIDTH: Record<Device, number> = { desktop: 1280, mobile: 390 }
const HEIGHT: Record<Device, number> = { desktop: 800, mobile: 844 }

// Renders `children` inside an <iframe> with its own real viewport, cloning
// every stylesheet from the host document so Tailwind's compiled CSS (and
// fonts) apply inside exactly as they do outside.
function IframeViewport({
  width,
  height,
  children,
}: {
  width: number
  height: number
  children: React.ReactNode
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    let done = false

    function setup() {
      if (done) return
      const doc = iframe!.contentDocument
      if (!doc) return
      done = true
      // Inline the *actual currently-applied* CSS text (via CSSOM) rather than
      // cloning <link>/<style> nodes and letting the iframe re-fetch them — a
      // second fetch of a dev-server CSS chunk can race or silently fail,
      // leaving the iframe's copy unstyled. This bit us with the Google Places
      // widget: its ::part() sizing override (globals.css) never arrived, so
      // it rendered at Google's huge, unstyled default instead of matching the
      // app's compact inputs. Reading document.styleSheets is synchronous —
      // no network round-trip, no race.
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const style = doc.createElement('style')
          style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n')
          doc.head.appendChild(style)
        } catch {
          // Cross-origin stylesheet (e.g. a font host) — cssRules is
          // inaccessible. Fall back to cloning the <link> as a best effort;
          // not required for anything this preview actually needs styled.
          const owner = sheet.ownerNode as Element | null
          if (owner) doc.head.appendChild(owner.cloneNode(true))
        }
      }
      doc.documentElement.className = document.documentElement.className
      doc.body.className = 'bg-surface text-slate-900 antialiased min-h-screen flex flex-col'
      doc.body.style.margin = '0'
      setMountNode(doc.body)
    }

    if (iframe.contentDocument?.readyState === 'complete') setup()
    iframe.addEventListener('load', setup)
    return () => iframe.removeEventListener('load', setup)
  }, [])

  return (
    <>
      <iframe
        ref={iframeRef}
        src="about:blank"
        title="Device preview"
        style={{ width, height, border: 0, display: 'block' }}
      />
      {mountNode && createPortal(children, mountNode)}
    </>
  )
}

export default function DevicePreviewFrame({
  onClose,
  children,
}: {
  onClose: () => void
  children: React.ReactNode
}) {
  const [device, setDevice] = useState<Device>('desktop')
  // If the admin is already viewing this from a phone-width browser, that IS
  // the mobile viewport — a Desktop/Mobile toggle has nothing useful to offer
  // (a 1280px desktop iframe can't fit either way, and a 390px mobile iframe
  // plus its phone-bezel chrome doesn't fit a real ~375-414px screen without
  // getting clipped). Skip the toggle and the iframe entirely and just render
  // the preview inline, exactly like the rest of the admin page — the real
  // window is already the right width for every `sm:` rule to respond to.
  const ambientIsMobile = useIsMobile()

  if (ambientIsMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
        <div className="sticky top-0 z-10 flex shrink-0 items-center border-b border-slate-200 bg-white px-4 py-2.5">
          <button
            onClick={onClose}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
          >
            ← Back to editor
          </button>
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-200">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <button
          onClick={onClose}
          className="text-sm font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
        >
          ← Back to editor
        </button>
        <div className="flex gap-0.5 rounded-md border border-slate-300 p-0.5">
          {(['desktop', 'mobile'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                device === d ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {d === 'desktop' ? '🖥️ Desktop' : '📱 Mobile'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto p-6">
        <div
          className={
            device === 'mobile'
              ? 'shrink-0 rounded-[2rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl'
              : 'shrink-0 rounded-lg border border-slate-300 shadow-lg'
          }
          style={{ maxWidth: '100%', overflow: 'hidden' }}
        >
          <IframeViewport width={WIDTH[device]} height={HEIGHT[device]}>
            {children}
          </IframeViewport>
        </div>
      </div>
    </div>
  )
}
