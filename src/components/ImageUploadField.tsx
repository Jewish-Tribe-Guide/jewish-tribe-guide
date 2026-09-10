'use client'

import { useRef, useState } from 'react'
import ImageCropModal from './ImageCropModal'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'

type Props = {
  /** Current image URL, or '' for none. */
  value: string
  onChange: (url: string) => void
  /** Where to POST the file (multipart form-data, field "file") — expects
   *  `{ ok: true, url: string }` back, same contract as the site logo's own
   *  upload route. */
  uploadUrl: string
  /** Admin bearer token — omitted by public call sites (e.g. the listing
   *  submission form), whose upload route has no admin session to check and
   *  relies on its own rate limiting instead. */
  token?: string
  /** Small circular preview (an icon) vs. a larger square one — purely
   *  visual; both upload the same way. */
  shape?: 'circle' | 'square'
  /** Width ÷ height of the crop stage/output and this field's own preview
   *  box — 1 (the default) for an icon/avatar-style photo, something wider
   *  for a banner-shaped image (the site's desktop hero photo is the first
   *  caller that needs this). See ImageCropModal's own doc. */
  aspect?: number
  helpText?: string
}

/** A picture picker that isn't just a file input: paste a URL, drag a file
 *  onto the preview, click through to the OS file browser, or — on a phone —
 *  take a photo directly. Built generic (not category-icon-specific) so the
 *  next image field this app needs (the site logo is the obvious first
 *  candidate) can reuse it instead of re-implementing the same four paths. */
export default function ImageUploadField({ value, onChange, uploadUrl, token, shape = 'circle', aspect = 1, helpText }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  // A picked/dropped/captured/pasted file waits here for the crop step (see
  // ImageCropModal) before it ever reaches `upload` — nothing is sent to the
  // server until the admin/submitter confirms how it's framed. Also doubles
  // as "re-editing an already-uploaded photo" — clicking the preview when a
  // photo is already set (see the dropzone's onClick below) reopens the same
  // modal, sourced from `originalFileRef` below when one's known rather than
  // `value` itself.
  const [cropSource, setCropSource] = useState<File | string | null>(null)
  // The actual picked file behind the CURRENT `value`, kept around
  // separately from `cropSource` (which clears back to null once the crop
  // modal closes) — without this, clicking "reposition" a second time in
  // the same session reopens the modal sourced from `value`, which by then
  // is last time's CROPPED output, not the original photo. Confirmed live:
  // repeatedly narrowing the same already-narrowed square/rect that way
  // makes it impossible to ever see the parts of the photo the first crop
  // left out, the exact opposite of what "reposition" is supposed to let
  // you do. Only reset when the visitor picks/drops/pastes an actual NEW
  // file — an already-uploaded `value` from a previous page load (no local
  // File behind it at all) still falls back to re-cropping the URL itself,
  // the same limitation any avatar editor that doesn't keep every original
  // around forever has.
  const originalFileRef = useRef<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  function pickNewFile(file: File) {
    originalFileRef.current = file
    setCropSource(file)
  }

  async function upload(file: Blob) {
    setError(null)
    setUploading(true)
    try {
      const body = new FormData()
      // The crop step always hands back a plain Blob (canvas.toBlob has no
      // notion of a filename) — wrap it so the upload route's multipart
      // parser sees a real file, same as the unmodified original would have.
      body.append('file', new File([file], 'photo.jpg', { type: file.type || 'image/jpeg' }))
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.errors?.join(' ') || 'Upload failed.')
      onChange(json.url as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg'

  // A `paste` event only fires on whatever element currently has focus, so
  // pasting an image (a screenshot, a copied picture from another app/tab —
  // not the "paste a URL" text field below, which is plain text) needs the
  // preview itself to be a focusable target the visitor clicks/tabs to
  // first, same pattern as GitHub's comment box or Slack's message field.
  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData?.items ?? []).find((it) => it.type.startsWith('image/'))
    if (!item) return
    e.preventDefault()
    const file = item.getAsFile()
    if (file) pickNewFile(file)
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        {/* The preview doubles as the drop target — dragging a file directly
            onto the picture it's about to replace reads more naturally than
            a separate empty dropzone box floating nearby. */}
        <div
          tabIndex={0}
          role="button"
          aria-label={value.trim() ? 'Adjust photo' : 'Image preview — click then paste an image, or drag one here'}
          // Clicking an already-set photo reopens the crop step on it (see
          // originalFileRef's own comment for why that's the ORIGINAL file
          // when one's known, not `value`) — no separate "Adjust" button
          // needed; the preview itself IS the affordance, the same way
          // clicking your own avatar to change it works everywhere else
          // (Slack, GitHub, …). An empty preview has nothing to reopen, so a
          // click there is a no-op — it still focuses for paste, and
          // drag/drop still works.
          onClick={() => { if (value.trim()) setCropSource(originalFileRef.current ?? value) }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && value.trim()) {
              e.preventDefault()
              setCropSource(originalFileRef.current ?? value)
            }
          }}
          onPaste={handlePaste}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) pickNewFile(file)
          }}
          className={`relative flex h-14 shrink-0 items-center justify-center overflow-hidden border-2 border-dashed bg-slate-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary ${shapeClass} ${
            dragOver ? 'border-primary bg-primary/5' : 'border-slate-200'
          }`}
          // A fixed height (h-14 above) with the width derived from `aspect`
          // — a plain `w-14` Tailwind class can't flex to match a caller-
          // supplied ratio, and this is the one dimension that actually
          // needs to vary: a square icon preview stays 56×56, a wide hero
          // preview becomes a correspondingly wide 56-tall strip instead of
          // a misleadingly square box.
          style={{ width: 56 * aspect }}
        >
          {value.trim() ? (
            // Plain <img>, not next/image: this previews a file that may have
            // been uploaded seconds ago (same reasoning as the site logo
            // field) — no benefit from the optimizer, and a real risk of it
            // showing a stale cached copy while the admin checks the upload
            // just landed.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] text-slate-400">
              {uploading ? '…' : 'None'}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : 'Upload image'}
            </button>
            {/* `capture` is only meaningful on a phone's camera-equipped
                browser — desktop browsers just treat this input identically
                to the plain one above, so there's no need to hide it behind
                a viewport check. */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60"
            >
              Take photo
            </button>
            {value.trim() && (
              <button
                type="button"
                onClick={() => {
                  originalFileRef.current = null
                  onChange('')
                }}
                className="text-sm text-muted hover:text-red-600 transition-colors cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
          <span className="text-[11px] text-muted">
            {value.trim()
              ? 'Click the preview to reposition/re-zoom it'
              : 'or drag an image onto the preview, or click it and paste one (⌘V / Ctrl+V)'}
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) pickNewFile(file)
          }}
          disabled={uploading}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) pickNewFile(file)
          }}
          disabled={uploading}
          className="hidden"
        />
      </div>

      {error && <span className="block text-[11px] text-red-600 mt-1">{error}</span>}

      <label className="block mt-2">
        <span className="block text-[11px] text-muted mb-1">…or paste an image URL directly</span>
        <input
          value={value}
          onChange={(e) => {
            // A manually-typed/pasted URL has no local File behind it —
            // clear any remembered original so a later "reposition" click
            // re-crops THIS url, not whatever was picked before it.
            originalFileRef.current = null
            onChange(e.target.value.trim())
          }}
          placeholder="https://…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      {helpText && <span className="block text-[11px] text-muted mt-1">{helpText}</span>}

      {cropSource && (
        <ImageCropModal
          source={cropSource}
          shape={shape}
          aspect={aspect}
          onCancel={() => setCropSource(null)}
          onConfirm={(blob) => {
            setCropSource(null)
            upload(blob)
          }}
        />
      )}
    </div>
  )
}
