'use client'

import { useEffect, useRef, useState } from 'react'
import type { SiteSettings } from '@/lib/siteSettings'
import type { DraftHomeSection } from '@/lib/homeSections'
import { previewUrl, writePreviewDraft } from '@/lib/previewDraft'
import { lightSpot } from '@/lib/previewSpot'
import { ForcedViewport } from '@/lib/useIsMobile'
import { IframeViewport } from './DevicePreviewFrame'

// The small preview beside Site's settings (boards 6, 7 and 8): the page
// being edited, with what hasn't been saved, shrunk to fit, on a computer or
// a phone. Either the real site in a frame (`src`, the home page: the draft
// rides across in sessionStorage, see previewDraft.ts) or a React tree drawn
// into one (`children`, a category page that may not exist yet), as
// DevicePreviewFrame does full-screen.

const DEVICES = {
  computer: { label: 'Computer', width: 1280, height: 1100 },
  phone: { label: 'Phone', width: 390, height: 844 },
} as const
export type PreviewDevice = keyof typeof DEVICES

/** How wide the preview is on the page. */
const SHOWN_WIDTH = { computer: 340, phone: 240 }

export const PREVIEW_PAUSE_MS = 700

/** The page draws after it loads: how long to look for a part of it. */
const SPOT_LOOK_MS = 200
const SPOT_LOOKS = 15

/** The tallest a whole page is shown, should one run on and on. */
const MOST_PAGE_HEIGHT = 4000

// How tall the page in the frame is, all of it. The body is at least the
// window's height (min-h-dvh), and the frame is made as tall as the page, so
// read as it stands the page could only ever grow: the frame's page is told
// to be its content's height instead.
const FIT_STYLE_ID = 'preview-fit-style'
function pageHeight(doc: Document): number {
  if (!doc.body) return 0
  if (!doc.getElementById(FIT_STYLE_ID)) {
    const style = doc.createElement('style')
    style.id = FIT_STYLE_ID
    style.textContent = 'body { min-height: 0 !important; }'
    doc.head?.append(style)
  }
  return Math.ceil(doc.body.getBoundingClientRect().height)
}

export function PreviewBeside({
  src,
  reload = 0,
  children,
  initialDevice = 'computer',
  device: shownDevice,
  onOpen,
  spot = null,
  wholePage = false,
}: {
  /** A page of the site to show. */
  src?: string
  /** Changed, the page loads again. */
  reload?: number
  /** Or a tree to draw, given the device it's drawn for. */
  children?: (device: PreviewDevice) => React.ReactNode
  initialDevice?: PreviewDevice
  /** Given, the page is always on this one, picked outside, and there's no
   *  Computer and Phone of its own. */
  device?: PreviewDevice
  /** Given, the shrunk page is a button that opens it full size. */
  onOpen?: () => void
  /** The part of the page to light up (see previewSpot.ts). */
  spot?: string | null
  /** As tall as the page `src` is, all of it, rather than one screen of it
   *  (the user, Nov 4: the computer's home page runs past one screen). */
  wholePage?: boolean
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [loads, setLoads] = useState(0)
  // Which spot this page turned out not to have.
  const [missing, setMissing] = useState<string | null>(null)
  useEffect(() => {
    const doc = frame.current?.contentDocument
    if (!doc) return
    // Goes on looking after finding it: on a phone the computer's parts can
    // show for a moment while the page draws, then go.
    let looks = 0
    const t = setInterval(() => {
      const found = lightSpot(doc, spot)
      if (++looks < SPOT_LOOKS) return
      clearInterval(t)
      setMissing(found ? null : spot)
    }, SPOT_LOOK_MS)
    return () => clearInterval(t)
  }, [spot, loads])
  // How tall the whole page is; kept across loads, so a reload doesn't jump.
  const [fitHeight, setFitHeight] = useState<number | null>(null)
  useEffect(() => {
    const doc = frame.current?.contentDocument
    if (!wholePage || !doc?.body) return
    const measure = () => {
      const h = pageHeight(doc)
      if (h > 0) setFitHeight(Math.min(h, MOST_PAGE_HEIGHT))
    }
    measure()
    // The page draws after it loads, and its photos after that.
    const Observer = doc.defaultView?.ResizeObserver
    const seen = Observer ? new Observer(measure) : null
    seen?.observe(doc.body)
    let looks = 0
    const t = setInterval(() => {
      measure()
      if (++looks >= SPOT_LOOKS) clearInterval(t)
    }, SPOT_LOOK_MS)
    return () => {
      seen?.disconnect()
      clearInterval(t)
    }
  }, [wholePage, loads])
  const [picked, setDevice] = useState<PreviewDevice>(initialDevice)
  const device = shownDevice ?? picked
  const { width } = DEVICES[device]
  const height = wholePage && fitHeight ? Math.max(fitHeight, DEVICES[device].height) : DEVICES[device].height
  const scale = SHOWN_WIDTH[device] / width
  const Frame = onOpen ? 'button' : 'div'

  return (
    <div className="flex flex-col gap-3">
      {!shownDevice && (
      <div role="group" aria-label="Preview on" className="self-start inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
        {(Object.keys(DEVICES) as PreviewDevice[]).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={device === d}
            onClick={() => setDevice(d)}
            className={`min-h-10 px-3.5 rounded-md text-sm font-semibold cursor-pointer ${
              device === d ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            {DEVICES[d].label}
          </button>
        ))}
      </div>
      )}
      <Frame
        {...(onOpen && { type: 'button' as const, onClick: onOpen, 'aria-label': 'Open the preview' })}
        className={`relative block p-0 overflow-hidden bg-white border border-slate-200 ${onOpen ? 'cursor-zoom-in' : ''} ${device === 'phone' ? 'rounded-[22px]' : 'rounded-[10px]'}`}
        style={{ width: SHOWN_WIDTH[device], height: Math.round(height * scale) }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left pointer-events-none"
          style={{ width, height, transform: `scale(${scale})` }}
          inert
        >
          {src ? (
            <iframe ref={frame} key={`${device}:${reload}:${src}`} src={src} title="Preview" tabIndex={-1} loading="lazy" onLoad={() => setLoads((n) => n + 1)} className="block border-0" style={{ width, height }} />
          ) : children ? (
            <IframeViewport key={device} width={width} height={height}>
              <ForcedViewport isMobile={device === 'phone'}>{children(device)}</ForcedViewport>
            </IframeViewport>
          ) : null}
        </div>
      </Frame>
      {spot && missing === spot && <p className="m-0 text-[13px] text-slate-600" style={{ width: SHOWN_WIDTH[device] }}>Not on the {DEVICES[device].label.toLowerCase()} version.</p>}
    </div>
  )
}

/** The home page beside its settings, with the unsaved draft. */
export default function SitePreview({
  community,
  settings,
  sections,
  device,
  spot = null,
  onOpen,
}: {
  community: string
  settings: SiteSettings
  sections: DraftHomeSection[]
  /** Which version of the page, picked beside it. */
  device: PreviewDevice
  spot?: string | null
  /** Clicked, the page opens full size. */
  onOpen?: () => void
}) {
  // Which draft the frame shows; 0 until the first one is written, so the
  // frame never loads ahead of it and shows the saved site instead. A pause
  // after typing reloads it, rather than every key.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => {
      writePreviewDraft({ settings, sections })
      setVersion((v) => v + 1)
    }, PREVIEW_PAUSE_MS)
    return () => clearTimeout(t)
  }, [settings, sections])

  return <PreviewBeside src={version > 0 ? previewUrl(community) : undefined} reload={version} device={device} spot={spot} onOpen={onOpen} wholePage={device === 'computer'} />
}
