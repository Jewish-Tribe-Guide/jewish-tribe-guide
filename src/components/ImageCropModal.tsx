'use client'

import { useEffect, useRef, useState } from 'react'

// The on-screen crop stage is a fixed square (in CSS px) regardless of the
// source photo's own dimensions or the eventual output size — same idea as
// WhatsApp/Twitter/every other avatar cropper: what you see while dragging
// IS the frame, at a size that comfortably fits a modal on a phone screen.
const STAGE_PX = 280
// The actual file that gets uploaded — a fixed square well above typical
// display size (CategoryIcon never renders larger than a few dozen px) but
// not so large it bloats the upload for what's ultimately a small avatar.
const OUTPUT_PX = 640

type Props = {
  /** A freshly picked/dropped/pasted file, OR the URL of a photo that's
   *  already uploaded — the "Adjust" button on an already-set photo reopens
   *  this same modal sourced from that URL instead of a new local file, so
   *  repositioning/re-zooming an existing pick doesn't require picking the
   *  original file again (see ImageUploadField). Re-editing only ever
   *  refines what was already cropped/saved, the same limitation any
   *  avatar editor that doesn't keep the pre-crop original around has. */
  source: File | string
  /** Matches ImageUploadField's own shape — only changes the crop guide's
   *  outline (circle vs. rounded square); the exported file is always a
   *  plain square either way; CSS (`rounded-full` on CategoryIcon, etc.)
   *  does the actual circular clipping wherever a circle-shaped photo is
   *  displayed, the same as it already does for an uncropped image. */
  shape: 'circle' | 'square'
  onCancel: () => void
  /** A square JPEG blob, already cropped/zoomed/positioned exactly as shown
   *  in the stage — the caller uploads it as-is. */
  onConfirm: (blob: Blob) => void
}

/** A WhatsApp-style "drag to reposition, slide to zoom" step between picking
 *  a photo and actually uploading it — without it, a photo whose subject
 *  isn't already dead-center and roughly square gets awkwardly cropped by
 *  CategoryIcon's `object-cover` with no way to see or fix that ahead of
 *  time. Renders a fixed-size square stage; the image is drawn oversized and
 *  panned/scaled within it, and only the visible square is ever exported. */
export default function ImageCropModal({ source, shape, onCancel, onConfirm }: Props) {
  const isFile = typeof source !== 'string'

  // A File needs an object URL created and revoked inside the SAME effect
  // (not useMemo-for-creation + a separate effect-for-cleanup) — under
  // StrictMode's dev-only double effect invocation, a create/cleanup pair
  // split across two hooks means the cleanup can revoke the one-and-only
  // URL a memo ever produces, right before the effect re-runs and leaves
  // the <img> pointing at a dead blob: URL (naturalWidth stays 0 forever,
  // nothing draws). One URL created and revoked per effect run sidesteps
  // that entirely. A string `source` (re-editing an already-uploaded photo)
  // needs none of this — it's already a real, stable URL.
  const [imgUrl, setImgUrl] = useState<string | null>(isFile ? null : source)
  useEffect(() => {
    if (typeof source === 'string') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImgUrl(source)
      return
    }
    const url = URL.createObjectURL(source)
    setImgUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [source])

  const imgRef = useRef<HTMLImageElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [exporting, setExporting] = useState(false)

  // The scale at which the image's SHORT side exactly fills the stage (the
  // "cover" fit) — this is `zoom`'s baseline of 1; the slider only ever
  // zooms IN from here, so the stage can never show empty space around the
  // image (same floor WhatsApp/Twitter's own croppers use).
  const baseScale = natural ? Math.max(STAGE_PX / natural.w, STAGE_PX / natural.h) : 1
  const effectiveScale = baseScale * zoom
  const displayedW = natural ? natural.w * effectiveScale : 0
  const displayedH = natural ? natural.h * effectiveScale : 0
  const maxOffsetX = Math.max(0, (displayedW - STAGE_PX) / 2)
  const maxOffsetY = Math.max(0, (displayedH - STAGE_PX) / 2)

  function clamp(x: number, y: number) {
    return {
      x: Math.min(maxOffsetX, Math.max(-maxOffsetX, x)),
      y: Math.min(maxOffsetY, Math.max(-maxOffsetY, y)),
    }
  }

  // Zooming out shrinks how far the image can be dragged — re-clamped right
  // in the slider's own handler (not a separate effect reacting to `zoom`)
  // using bounds computed from the NEW value directly, since `maxOffsetX/Y`
  // above are still one render behind at the moment this fires.
  function handleZoom(z: number) {
    setZoom(z)
    const scale = baseScale * z
    const w = natural ? natural.w * scale : 0
    const h = natural ? natural.h * scale : 0
    const maxX = Math.max(0, (w - STAGE_PX) / 2)
    const maxY = Math.max(0, (h - STAGE_PX) / 2)
    setOffset((o) => ({ x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) }))
  }

  function handlePointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragState.current = { startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y }
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current) return
    const { startX, startY, originX, originY } = dragState.current
    setOffset(clamp(originX + (e.clientX - startX), originY + (e.clientY - startY)))
  }
  function handlePointerUp() {
    dragState.current = null
  }

  function handleConfirm() {
    if (!imgRef.current || !natural) return
    setExporting(true)
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_PX
    canvas.height = OUTPUT_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setExporting(false)
      return
    }
    // Same geometry the stage renders with — the image sits centered in the
    // stage, then shifted by `offset`; working out its top-left from that
    // lets the visible STAGE_PX×STAGE_PX window be mapped back to a region
    // of the original, full-resolution image to actually draw from.
    const imgTopLeftX = STAGE_PX / 2 + offset.x - displayedW / 2
    const imgTopLeftY = STAGE_PX / 2 + offset.y - displayedH / 2
    const sourceX = -imgTopLeftX / effectiveScale
    const sourceY = -imgTopLeftY / effectiveScale
    const sourceSize = STAGE_PX / effectiveScale
    ctx.drawImage(imgRef.current, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_PX, OUTPUT_PX)
    canvas.toBlob(
      (blob) => {
        setExporting(false)
        if (blob) onConfirm(blob)
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
        <p className="mb-3 text-sm font-semibold text-slate-800">Reposition photo</p>

        <div
          ref={stageRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative mx-auto overflow-hidden rounded-lg bg-slate-800 touch-none select-none"
          style={{ width: STAGE_PX, height: STAGE_PX, cursor: 'grab' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a local
              object URL for the in-progress crop, not a real hosted image */}
          {imgUrl && <img
            ref={imgRef}
            src={imgUrl}
            alt=""
            // Only load-bearing for a re-edit's remote URL (a blob: URL is
            // always same-origin, so this is a no-op there) — without it,
            // drawing a cross-origin <img> onto the export canvas taints it
            // and canvas.toBlob silently produces nothing. Our own storage
            // bucket already serves public objects with permissive CORS.
            crossOrigin="anonymous"
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{
              width: displayedW || undefined,
              height: displayedH || undefined,
              // Tailwind's preflight resets EVERY <img> to `max-width: 100%`
              // — harmless almost everywhere (that's the point of it), but
              // here it silently caps this image at the stage's own 280px
              // width the moment zoom pushes displayedW past that, while
              // this component's own export math (which reads `displayedW`
              // straight from state, not the DOM) has no idea the on-screen
              // picture just got clamped smaller than what was asked for.
              // The visible crop and the exported crop quietly stop
              // matching — WYSIWYG breaks with no error anywhere. Explicit
              // `none` here is what actually lets `width` above take effect
              // past 280px.
              maxWidth: 'none',
              maxHeight: 'none',
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            }}
          />}
          {/* The crop guide — a punched-hole vignette (a huge box-shadow on a
              shape spanning the FULL stage, no inset margin) — same trick
              every circular-avatar cropper uses. This has to line up exactly
              with what CategoryIcon (or any other 'circle'-shape caller)
              actually displays later: a plain square image inside a
              `rounded-full` + `object-cover` box shows its circle touching
              all four edges, not one inset from them — an inset guide here
              would darken (and imply hidden) a ring of content that the real
              icon shows anyway, and — worse — hide from view a ring that
              genuinely does get clipped. What's exported is always exactly
              the stage's own square bounds regardless of this guide. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              borderRadius: shape === 'circle' ? '9999px' : '0px',
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
              outline: '1px solid rgba(255,255,255,0.8)',
            }}
          />
        </div>

        <label className="mt-4 flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="w-full accent-primary cursor-pointer"
          />
        </label>
        <p className="mt-1 text-[11px] text-muted">Drag the photo to reposition it.</p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!natural || exporting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
          >
            {exporting ? 'Saving…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>
  )
}
