'use client'

import { useEffect, useState } from 'react'
import type { SiteSettings } from '@/lib/siteSettings'
import type { DraftHomeSection } from '@/lib/homeSections'
import { previewUrl, writePreviewDraft } from '@/lib/previewDraft'

// The small preview beside Site's settings (boards 7 and 8): the real home
// page with the unsaved draft, shrunk to fit, on a computer or a phone. It
// is the site itself in a frame (see previewDraft.ts), so what it shows is
// what Save would put live. A pause after typing reloads it, rather than
// every key.

const DEVICES = {
  computer: { label: 'Computer', width: 1280, height: 1100 },
  phone: { label: 'Phone', width: 390, height: 844 },
} as const
type Device = keyof typeof DEVICES

/** How wide the preview is on the page. */
const SHOWN_WIDTH = { computer: 340, phone: 240 }

export const PREVIEW_PAUSE_MS = 700

export default function SitePreview({
  community,
  settings,
  sections,
  initialDevice = 'computer',
}: {
  community: string
  settings: SiteSettings
  sections: DraftHomeSection[]
  initialDevice?: Device
}) {
  const [device, setDevice] = useState<Device>(initialDevice)
  // Which draft the frame shows; 0 until the first one is written, so the
  // frame never loads ahead of it and shows the saved site instead.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => {
      writePreviewDraft({ settings, sections })
      setVersion((v) => v + 1)
    }, PREVIEW_PAUSE_MS)
    return () => clearTimeout(t)
  }, [settings, sections])

  const { width, height } = DEVICES[device]
  const scale = SHOWN_WIDTH[device] / width

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Preview on" className="self-start inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
        {(Object.keys(DEVICES) as Device[]).map((d) => (
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
      <div
        className={`relative overflow-hidden bg-white border border-slate-200 ${device === 'phone' ? 'rounded-[22px]' : 'rounded-[10px]'}`}
        style={{ width: SHOWN_WIDTH[device], height: Math.round(height * scale) }}
      >
        {version > 0 && (
          <iframe
            key={`${device}:${version}`}
            src={previewUrl(community)}
            title="Preview"
            tabIndex={-1}
            loading="lazy"
            className="absolute top-0 left-0 origin-top-left pointer-events-none border-0"
            style={{ width, height, transform: `scale(${scale})` }}
          />
        )}
      </div>
    </div>
  )
}
