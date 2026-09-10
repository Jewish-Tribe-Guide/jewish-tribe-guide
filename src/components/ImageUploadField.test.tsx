// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImageUploadField from './ImageUploadField'

// ImageCropModal itself needs a real image load + canvas (see its own lack
// of unit tests) — out of scope here. What this file cares about is WHICH
// `source` ImageUploadField hands it on each open, so the mock just surfaces
// that plus a couple of buttons standing in for "Use photo"/"Cancel".
vi.mock('./ImageCropModal', () => ({
  default: ({
    source,
    onConfirm,
    onCancel,
  }: {
    source: File | string
    onConfirm: (blob: Blob) => void
    onCancel: () => void
  }) => (
    <div>
      <p>Crop modal open</p>
      <p>Source: {typeof source === 'string' ? source : `file:${source.name}`}</p>
      <button onClick={() => onConfirm(new Blob(['cropped'], { type: 'image/jpeg' }))}>Confirm crop</button>
      <button onClick={onCancel}>Cancel crop</button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function fakeFile(name: string) {
  return new File(['fake image bytes'], name, { type: 'image/jpeg' })
}

// A real caller always feeds the resulting URL straight back in as the next
// `value` (see SiteSettingsEditor, CategoryFormFields, ListingForm) — this
// wrapper does the same, which is what lets a SECOND reposition see the
// first crop's uploaded URL as `value` at all.
function ControlledField() {
  const [value, setValue] = useState('')
  return <ImageUploadField value={value} onChange={setValue} uploadUrl="/api/upload" />
}

describe('ImageUploadField', () => {
  // Regression test: reported live — after "Use photo", reopening the crop
  // step to readjust re-cropped the ALREADY-CROPPED upload instead of the
  // original picked file, so repositioning could only ever narrow further,
  // never recover whatever the first crop left out.
  it('re-crops the original picked file on a second reposition, not the previously uploaded URL', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ok: true, url: 'https://example.com/cropped-1.jpg' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ok: true, url: 'https://example.com/cropped-2.jpg' }),
        }),
    )

    render(<ControlledField />)

    // "Upload image"'s hidden file input has no `capture` attribute; "Take
    // photo"'s does — this is how the test tells the two apart.
    const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement
    const original = fakeFile('vacation.jpg')
    await user.upload(fileInput, original)

    expect(screen.getByText('Source: file:vacation.jpg')).toBeInTheDocument()
    await user.click(screen.getByText('Confirm crop'))

    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/cropped-1.jpg'))
    expect(screen.queryByText('Crop modal open')).not.toBeInTheDocument()

    // Reposition the now-uploaded photo — this is the exact scenario that
    // broke: it used to reopen sourced from cropped-1.jpg (last time's
    // OUTPUT), not vacation.jpg (the real original).
    await user.click(screen.getByRole('button', { name: 'Adjust photo' }))

    expect(screen.getByText('Source: file:vacation.jpg')).toBeInTheDocument()

    await user.click(screen.getByText('Confirm crop'))
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/cropped-2.jpg'))
  })

  it('falls back to re-cropping the URL itself when no local file is known (an already-uploaded photo from a previous session)', async () => {
    const user = userEvent.setup()
    function PreloadedField() {
      const [value, setValue] = useState('https://example.com/from-last-session.jpg')
      return <ImageUploadField value={value} onChange={setValue} uploadUrl="/api/upload" />
    }
    render(<PreloadedField />)

    await user.click(screen.getByRole('button', { name: 'Adjust photo' }))

    expect(screen.getByText('Source: https://example.com/from-last-session.jpg')).toBeInTheDocument()
  })

  it('a freshly picked file replaces whatever URL was remembered before it', async () => {
    const user = userEvent.setup()
    render(<ControlledField />)

    // Typing a URL only sets `value` directly — it doesn't open the crop
    // modal on its own, same as a real caller feeding in an existing value.
    await user.type(screen.getByPlaceholderText('https://…'), 'https://example.com/pasted.jpg')
    await user.click(screen.getByRole('button', { name: 'Adjust photo' }))
    expect(screen.getByText('Source: https://example.com/pasted.jpg')).toBeInTheDocument()
    await user.click(screen.getByText('Cancel crop'))

    const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement
    await user.upload(fileInput, fakeFile('vacation.jpg'))

    await user.click(screen.getByRole('button', { name: 'Adjust photo' }))

    expect(screen.getByText('Source: file:vacation.jpg')).toBeInTheDocument()
  })

  // Regression test: reported live — setting the photo by pasting a URL
  // directly (a real admin flow: a stock-photo link, not a downloaded file)
  // rather than uploading a file, then cropping and reopening to readjust,
  // reopened sourced from the CROPPED OUTPUT instead of the pasted URL —
  // the exact same bug as the File case above, just for the other of the
  // two ways an "original" can arrive. The pasted URL is real: 900×1293
  // portrait; a naive re-crop of the already-4:3 output has nowhere left to
  // reposition to.
  it('re-crops the originally PASTED URL on a second reposition, not the previously uploaded (cropped) URL', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ok: true, url: 'https://example.com/cropped-1.jpg' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ok: true, url: 'https://example.com/cropped-2.jpg' }),
        }),
    )
    render(<ControlledField />)

    await user.type(screen.getByPlaceholderText('https://…'), 'https://example.com/city-hall-original.jpg')
    await user.click(screen.getByRole('button', { name: 'Adjust photo' }))
    expect(screen.getByText('Source: https://example.com/city-hall-original.jpg')).toBeInTheDocument()

    await user.click(screen.getByText('Confirm crop'))
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/cropped-1.jpg'))

    await user.click(screen.getByRole('button', { name: 'Adjust photo' }))

    expect(screen.getByText('Source: https://example.com/city-hall-original.jpg')).toBeInTheDocument()

    await user.click(screen.getByText('Confirm crop'))
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/cropped-2.jpg'))
  })

  // Regression test: reported live — SiteSettingsEditor's "Preview" button
  // swaps its ENTIRE rendered form for an iframe and back, which unmounts
  // ImageUploadField itself (it isn't rendered at all while previewing) even
  // though SiteSettingsEditor's own component instance never unmounts. That
  // wipes an internal ref exactly like a real remount would, bringing back
  // the "reposition re-crops the cropped output" bug for a third reason
  // (after: a second reposition on the same instance; a URL pasted instead
  // of a file) — the fix for those two didn't survive an actual unmount at
  // all. `originalSource`/`onOriginalSourceChange` let a caller keep this
  // memory on ITS OWN instance instead, which is what this simulates: a
  // parent-owned ref, handed down as the controlled props, surviving an
  // unmount/remount of ImageUploadField the same way it needs to survive
  // SiteSettingsEditor's Preview toggle.
  it('survives ImageUploadField itself unmounting and remounting, when the caller owns the original via controlled props', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, url: 'https://example.com/cropped-1.jpg' }),
      }),
    )

    function CallerOwnedField() {
      const [value, setValue] = useState('')
      const [mounted, setMounted] = useState(true)
      const originalRef = useRef<File | string | null>(null)
      return (
        <div>
          {/* Stands in for SiteSettingsEditor's `if (previewing) return <DevicePreviewFrame />` — a real unmount of this field, not a hide/show. */}
          <button onClick={() => setMounted((m) => !m)}>Toggle preview</button>
          {mounted && (
            <ImageUploadField
              value={value}
              onChange={setValue}
              uploadUrl="/api/upload"
              originalSource={originalRef.current}
              onOriginalSourceChange={(source) => { originalRef.current = source }}
            />
          )}
        </div>
      )
    }
    render(<CallerOwnedField />)

    const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement
    await user.upload(fileInput, fakeFile('vacation.jpg'))
    await user.click(screen.getByText('Confirm crop'))
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/cropped-1.jpg'))

    // Toggle "Preview" on, then back off — a real unmount and fresh mount of
    // ImageUploadField, same as the app's own DevicePreviewFrame swap.
    await user.click(screen.getByText('Toggle preview'))
    expect(screen.queryByRole('button', { name: 'Adjust photo' })).not.toBeInTheDocument()
    await user.click(screen.getByText('Toggle preview'))

    await user.click(screen.getByRole('button', { name: 'Adjust photo' }))

    expect(screen.getByText('Source: file:vacation.jpg')).toBeInTheDocument()
  })
})
