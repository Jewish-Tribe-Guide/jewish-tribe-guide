'use client'

import { useRef, useState } from 'react'

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
  helpText?: string
}

/** A picture picker that isn't just a file input: paste a URL, drag a file
 *  onto the preview, click through to the OS file browser, or — on a phone —
 *  take a photo directly. Built generic (not category-icon-specific) so the
 *  next image field this app needs (the site logo is the obvious first
 *  candidate) can reuse it instead of re-implementing the same four paths. */
export default function ImageUploadField({ value, onChange, uploadUrl, token, shape = 'circle', helpText }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setError(null)
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
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

  return (
    <div>
      <div className="flex items-center gap-3">
        {/* The preview doubles as the drop target — dragging a file directly
            onto the picture it's about to replace reads more naturally than
            a separate empty dropzone box floating nearby. */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) upload(file)
          }}
          className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden border-2 border-dashed bg-slate-50 transition-colors ${shapeClass} ${
            dragOver ? 'border-primary bg-primary/5' : 'border-slate-200'
          }`}
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
                onClick={() => onChange('')}
                className="text-sm text-muted hover:text-red-600 transition-colors cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
          <span className="text-[11px] text-muted">or drag an image onto the preview</span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) upload(file)
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
            if (file) upload(file)
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
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="https://…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      {helpText && <span className="block text-[11px] text-muted mt-1">{helpText}</span>}
    </div>
  )
}
