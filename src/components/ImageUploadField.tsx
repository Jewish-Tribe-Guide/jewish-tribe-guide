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
  /** Lets the CALLER own where "the real original behind `value`" is kept,
   *  instead of this component's own internal ref — needed by a caller that
   *  can itself unmount and remount this field for reasons that have
   *  nothing to do with the photo (SiteSettingsEditor's Preview button
   *  replaces its entire form, including this field, with an iframe and
   *  back; switching between its Site/Desktop/Mobile tabs conditionally
   *  renders which fields exist at all). Confirmed live: either one wipes a
   *  plain internal ref exactly like a real remount would, reintroducing
   *  the "reposition re-crops the cropped output" bug this same tracking
   *  was already built to fix — the difference is only WHERE the memory
   *  lives, so it needs to live somewhere that survives whatever the
   *  caller's own component does. Pass both or neither; when omitted, this
   *  component tracks it internally exactly as before (fine for a caller,
   *  like ListingForm or CategoryFormFields, that never unmounts this field
   *  except when the photo itself is genuinely done with). */
  originalSource?: File | string | null
  onOriginalSourceChange?: (source: File | string | null) => void
  helpText?: string
  /** The small caption under the buttons — "Click the preview to
   *  reposition/re-zoom it" once a photo is set, or "or drag an image onto
   *  the preview, or click it and paste one (⌘V / Ctrl+V)" before one is.
   *  Default true (admin's logo/hero/category-icon editors keep both — see
   *  SiteSettingsEditor's own tests). Off for the public listing form
   *  (ListingForm) specifically: confirmed with the site owner that a
   *  visitor filling out one form field at a time doesn't need either
   *  spelled out the way an admin configuring branding once might — Upload
   *  image/Paste URL are already visible, self-explanatory buttons, and
   *  drag/paste is a bonus shortcut, not something a
   *  first-time visitor needs telling about. */
  showRepositionHint?: boolean
  /** Starts the "…or paste an image URL directly" row collapsed behind a
   *  small link instead of always showing its own label + input. Default
   *  false (admin's own uploaders keep it always visible — admins actually
   *  use this for stock-photo links). On for the public listing form
   *  specifically: most visitors upload a file, and two permanently-visible
   *  lines for an edge-case path is exactly the bulk that field didn't need
   *  — see ListingForm's own call site. */
  collapseUrlInput?: boolean
}

/** A picture picker that isn't just a file input: paste a URL, drag a file
 *  onto the preview, click through to the OS file browser, or — on a phone —
 *  take a photo directly. Built generic (not category-icon-specific) so the
 *  next image field this app needs (the site logo is the obvious first
 *  candidate) can reuse it instead of re-implementing the same four paths. */
export default function ImageUploadField({
  value,
  onChange,
  uploadUrl,
  token,
  shape = 'circle',
  aspect = 1,
  originalSource: controlledOriginalSource,
  onOriginalSourceChange,
  helpText,
  showRepositionHint = true,
  collapseUrlInput = false,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  // Starts open unless the caller asked to collapse it (see collapseUrlInput's
  // own doc) — once a visitor/admin clicks to reveal it, it stays open for
  // the rest of this field's life, same as any other disclosure link.
  const [urlInputOpen, setUrlInputOpen] = useState(!collapseUrlInput)
  // A picked/dropped/captured/pasted file waits here for the crop step (see
  // ImageCropModal) before it ever reaches `upload` — nothing is sent to the
  // server until the admin/submitter confirms how it's framed. Also doubles
  // as "re-editing an already-uploaded photo" — clicking the preview when a
  // photo is already set (see the dropzone's onClick below) reopens the same
  // modal, sourced from getOriginalSource() below when one's known rather
  // than `value` itself.
  const [cropSource, setCropSource] = useState<File | string | null>(null)
  // The actual source behind the CURRENT `value` — a File when one was
  // picked/dropped/pasted-as-image, or a URL when one was typed/pasted into
  // the URL field below — kept around separately from `cropSource` (which
  // clears back to null once the crop modal closes). Without this, clicking
  // "reposition" a second time in the same session reopens the modal
  // sourced from `value`, which by then is last time's CROPPED output, not
  // the original photo. Confirmed live TWO ways: repeatedly narrowing an
  // already-cropped File makes it impossible to see the parts the first
  // crop left out, and — the one this ref used to get wrong — pasting a URL
  // directly (a real admin's actual flow: a stock-photo link, not a
  // downloaded file) had this cleared to null on the theory that "no local
  // File behind it" meant nothing could be remembered, when the pasted URL
  // ITSELF is exactly as good an original as a File is: reopening after a
  // crop fell back to `value` (the cropped, frame-shaped output) instead of
  // the pasted URL (the real, differently-shaped original), reproducing the
  // exact bug this ref exists to prevent. Only reset when the visitor
  // provides an actual NEW source (a new file, drop, paste-as-image, typed
  // URL, or Remove) — an already-uploaded `value` from a PREVIOUS page load
  // (no local original of any kind ever seen this session) still falls back
  // to re-cropping the URL itself, the one limitation no amount of local
  // bookkeeping can fix without uploading every original forever.
  // Falls back to a local ref when the caller doesn't pass
  // originalSource/onOriginalSourceChange (see that prop's own doc) — reads
  // and writes always go through getOriginalSource/setOriginalSource below,
  // never this ref directly, so the rest of the component doesn't need to
  // know which mode it's in.
  const localOriginalSourceRef = useRef<File | string | null>(null)
  const isOriginalSourceControlled = onOriginalSourceChange !== undefined
  function getOriginalSource(): File | string | null {
    return isOriginalSourceControlled ? (controlledOriginalSource ?? null) : localOriginalSourceRef.current
  }
  function setOriginalSource(source: File | string | null) {
    if (isOriginalSourceControlled) onOriginalSourceChange!(source)
    else localOriginalSourceRef.current = source
  }
  const fileInputRef = useRef<HTMLInputElement>(null)

  function pickNewFile(file: File) {
    setOriginalSource(file)
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
      {/* Preview and buttons stay side by side at every width — the buttons
          now carry short mobile labels ("Upload"/"Camera"/"URL", see below)
          specifically so they fit the leftover width next to the preview
          without wrapping, rather than needing the row's full width the
          longer labels did. An earlier version stacked the preview above
          the buttons on narrow screens to solve that same crowding, but
          shortening the labels keeps the picture and its buttons on one
          line instead, which is how this looked before either change. */}
      <div className="flex items-center gap-3">
        {/* The preview doubles as the drop target — dragging a file directly
            onto the picture it's about to replace reads more naturally than
            a separate empty dropzone box floating nearby. */}
        <div
          tabIndex={0}
          role="button"
          aria-label={value.trim() ? 'Adjust photo' : 'Image preview — click then paste an image, or drag one here'}
          // Clicking an already-set photo reopens the crop step on it (see
          // getOriginalSource's own doc for why that's the ORIGINAL source
          // when one's known, not `value`) — no separate "Adjust" button
          // needed; the preview itself IS the affordance, the same way
          // clicking your own avatar to change it works everywhere else
          // (Slack, GitHub, …). An empty preview has nothing to reopen, so a
          // click there is a no-op — it still focuses for paste, and
          // drag/drop still works.
          onClick={() => { if (value.trim()) setCropSource(getOriginalSource() ?? value) }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && value.trim()) {
              e.preventDefault()
              setCropSource(getOriginalSource() ?? value)
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
            {/* One button, not two — a plain `<input type="file">` with no
                `capture` attribute already opens the OS's own chooser on a
                phone (iOS Safari: "Take Photo", "Photo Library", "Choose
                File"; Android Chrome: "Camera", "Files"), so a separate
                "Take photo" button offering the exact same camera option
                was a whole extra control for what `capture` only saves —
                skipping straight past that chooser instead of one extra
                tap through it. Desktop has no such chooser at all, where
                the second button did literally nothing "Upload image"
                didn't. Confirmed live. Each label carries a short mobile
                version and the full desktop one, swapped with
                sm:hidden/hidden sm:inline — aria-label pins the accessible
                name to the full phrase regardless of which one CSS is
                currently showing, since a screen reader (or a test, which
                doesn't load Tailwind's compiled CSS and so sees BOTH spans
                as present) would otherwise read both back to back instead
                of one real name. */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label={uploading ? 'Uploading…' : 'Upload image'}
              className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60"
            >
              {uploading ? (
                <span aria-hidden="true">Uploading…</span>
              ) : (
                <>
                  <span aria-hidden="true" className="sm:hidden">Upload</span>
                  <span aria-hidden="true" className="hidden sm:inline">Upload image</span>
                </>
              )}
            </button>
            {/* A pasted URL is a second real way to add a photo, not a
                lesser afterthought, so it's a real toggle button in this
                row — same as Upload image — not a trigger that vanishes
                once clicked with a separate "Hide" bolted on somewhere else
                to undo it. One control, two states: click to reveal the
                input below, click again to close it (closing never touches
                `value` — nothing to lose, since the preview above already
                reflects it live). Active state matches the app's existing
                "currently selected" toggle convention (see the directory's
                own Popularity/Distance sort buttons) rather than inventing
                a new one. Only rendered at all when the caller asked to
                collapse this (collapseUrlInput) — admin's own uploaders
                keep the input permanently visible with no button here. */}
            {collapseUrlInput && (
              <button
                type="button"
                onClick={() => setUrlInputOpen((open) => !open)}
                aria-pressed={urlInputOpen}
                aria-label="Paste URL"
                className={`text-sm font-medium rounded-md border px-3 py-1.5 transition-colors cursor-pointer ${
                  urlInputOpen
                    ? 'border-primary bg-primary text-white hover:bg-primary/90'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span aria-hidden="true" className="sm:hidden">URL</span>
                <span aria-hidden="true" className="hidden sm:inline">Paste URL</span>
              </button>
            )}
            {value.trim() && (
              <button
                type="button"
                onClick={() => {
                  setOriginalSource(null)
                  onChange('')
                }}
                className="text-sm text-muted hover:text-red-600 transition-colors cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
          {/* Both hint captions are opt-out via showRepositionHint — same
              flag now covers whichever one applies (they're mutually
              exclusive already, based on value). Off for the public listing
              form specifically: Upload image/Paste URL are already visible,
              self-explanatory buttons, and drag/paste
              (⌘V) is a bonus shortcut for someone who already knows it, not
              something a first-time visitor needs spelled out. Admin's own
              uploaders keep both — see the prop's own doc. */}
          {showRepositionHint && (
            value.trim() ? (
              <span className="text-[11px] text-muted">Click the preview to reposition/re-zoom it</span>
            ) : (
              <span className="text-[11px] text-muted">
                or drag an image onto the preview, or click it and paste one (⌘V / Ctrl+V)
              </span>
            )
          )}
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
      </div>

      {error && <span className="block text-[11px] text-red-600 mt-1">{error}</span>}

      {/* The trigger for this (when collapsed) now lives in the button row
          above, next to Upload image — see its own comment. */}
      {/* Closing this (when collapseUrlInput) happens from the same "Paste
          URL" toggle in the button row above, not a separate control here —
          see its own comment. */}
      {urlInputOpen && (
        <label className="block mt-2">
          {/* Only when this row has no toggle of its own above it (admin's
              own uploaders, collapseUrlInput off) — the public form's
              "Paste URL" button already says what this input is for, so
              the caption repeating it right underneath was pure noise. The
              input still needs an accessible name once the caption's gone
              (aria-label below), since nothing else in the DOM labels it. */}
          {!collapseUrlInput && (
            <span className="block text-[11px] text-muted mb-1">…or paste an image URL directly</span>
          )}
          <input
            aria-label={collapseUrlInput ? 'Image URL' : undefined}
            value={value}
            onChange={(e) => {
              // A manually-typed/pasted URL IS an original, every bit as much
              // as a picked File is — see getOriginalSource's own doc for why
              // this used to clear it instead, which was the bug. Setting it
              // here (not just calling onChange) means a later crop's own
              // onChange — the resulting upload URL — won't overwrite it, so
              // "reposition" after that crop still targets THIS url, not the
              // frame-shaped output.
              const url = e.target.value.trim()
              setOriginalSource(url)
              onChange(url)
            }}
            placeholder="https://…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
      )}
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
