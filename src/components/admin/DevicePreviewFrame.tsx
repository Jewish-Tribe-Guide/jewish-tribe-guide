'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ForcedViewport, useIsMobile } from '@/lib/useIsMobile'

// Wraps a preview in a full-viewport overlay with a Desktop/Mobile toggle, so
// "what does this look like" isn't stuck at the admin shell's ~768px content
// width (skinnier than any real desktop) and mobile has a way to be seen at
// all.
//
// Either way the device frame is a real <iframe>, never just a resized <div>:
// Tailwind's `sm:` classes (and every other responsive rule in the app) are
// ordinary CSS media queries keyed off the actual rendering viewport, which for
// anything on the page is the browser window — a narrower wrapper div has zero
// effect on them. An iframe gets its own independent viewport equal to its own
// rendered size, so the breakpoints respond to the frame's width for real.
//
// Two modes, because the admin has two kinds of thing to preview:
//
//   `src` — point the frame at the real site. Used for the site/home preview,
//   where a live equivalent exists. This is the better mode where it applies:
//   the page inside gets its own window and its own history stack, so it's
//   genuinely navigable (clicking a card, opening the map, backing out) without
//   touching the admin's history — which the admin itself uses to track whether
//   this overlay is open. It also can't drift from what visitors see, because
//   it *is* what visitors see. The unsaved draft rides across in
//   sessionStorage (see previewDraft.ts).
//
//   `children` — portal a React tree into a blank frame. Used for in-progress
//   forms and categories, which have no live counterpart to navigate to: a
//   category that hasn't been saved yet doesn't exist on the site. Keeps the
//   exact live React tree/state, no serializing a draft across a navigation.
//
// The portal mode is why <ForcedViewport> is here: portaled children render
// their markup inside the iframe but still *execute* in this window's JS realm,
// so any `useIsMobile()` in them would measure the admin's browser rather than
// the frame, and CSS- and JS-gated breakpoints would disagree inside one
// preview. `src` mode needs none of that — the app runs in the frame's own
// realm and measures itself correctly.

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
  width: number | string
  height: number | string
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
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        doc.head.appendChild(node.cloneNode(true))
      })
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
  src,
  initialDevice = 'desktop',
}: {
  onClose: () => void
  /** Portal mode — a React tree with no live equivalent (a draft form or
   *  category). Ignored when `src` is set. */
  children?: React.ReactNode
  /** Live-site mode — a URL to load. Navigable. */
  src?: string
  /** Which device to open on. The toggle still works from there. */
  initialDevice?: Device
}) {
  const [device, setDevice] = useState<Device>(initialDevice)
  // If the admin is already viewing this from a phone-width browser, that IS
  // the mobile viewport — a Desktop/Mobile toggle has nothing useful to offer
  // (a 1280px desktop iframe can't fit either way, and a 390px mobile iframe
  // plus its phone-bezel chrome doesn't fit a real ~375-414px screen without
  // getting clipped). Skip the toggle and let the preview fill the screen.
  const ambientIsMobile = useIsMobile()

  function renderFrame(width: number | string, height: number | string) {
    if (src) {
      return (
        <iframe
          // Remount on device change so the page inside lays out for its new
          // viewport from a clean load rather than mid-session.
          key={device}
          src={src}
          title="Site preview"
          style={{ width, height, border: 0, display: 'block' }}
        />
      )
    }
    return (
      <IframeViewport width={width} height={height}>
        <ForcedViewport isMobile={ambientIsMobile || device === 'mobile'}>{children}</ForcedViewport>
      </IframeViewport>
    )
  }

  if (ambientIsMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        <div className="flex shrink-0 items-center border-b border-slate-200 bg-white px-4 py-2.5">
          <button
            onClick={onClose}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
          >
            ← Back to editor
          </button>
        </div>
        <div className="min-h-0 flex-1">{renderFrame('100%', '100%')}</div>
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
        {src && (
          <p className="hidden text-xs text-muted md:block">
            Your unsaved changes, on the real site — click around, it navigates.
          </p>
        )}
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
          {renderFrame(WIDTH[device], HEIGHT[device])}
        </div>
      </div>
    </div>
  )
}
