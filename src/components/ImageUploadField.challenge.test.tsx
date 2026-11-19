// @vitest-environment jsdom
import { forwardRef, useImperativeHandle } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ImageUploadField from './ImageUploadField'

// The public photo route refuses an upload without a passed Turnstile
// challenge (Nov 19), and the photo goes up when it's picked, before the
// listing's own send, so the field runs a challenge of its own.

const challenge = vi.hoisted(() => ({
  /** Answers the mounted challenge, as Cloudflare would. */
  solve: null as ((token: string) => void) | null,
  resets: 0,
  mounted: [] as string[],
}))

vi.mock('./resources/useListingSubmit', () => ({ useTurnstileActive: () => true }))
vi.mock('./TurnstileWidget', () => ({
  default: forwardRef<{ reset: () => void }, { onVerify: (t: string) => void; appearance?: string }>(function Widget({ onVerify, appearance }, ref) {
    challenge.solve = onVerify
    challenge.mounted.push(appearance ?? 'always')
    useImperativeHandle(ref, () => ({ reset: () => { challenge.resets++ } }))
    return null
  }),
}))
vi.mock('./ImageCropModal', () => ({
  default: ({ onConfirm }: { onConfirm: (blob: Blob) => void }) => (
    <button onClick={() => onConfirm(new Blob(['cropped'], { type: 'image/jpeg' }))}>Confirm crop</button>
  ),
}))

const sent: FormData[] = []
beforeEach(() => {
  challenge.solve = null
  challenge.resets = 0
  challenge.mounted = []
  sent.length = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(init.body as FormData)
    return { ok: true, json: async () => ({ ok: true, url: `https://cdn/${sent.length}.jpg` }) }
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function pickAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await user.upload(input, new File(['x'], 'p.jpg', { type: 'image/jpeg' }))
  await user.click(screen.getByText('Confirm crop'))
}

describe('a photo upload’s challenge', () => {
  it('sends a token with each upload, a fresh one each time, and shows nothing unless Cloudflare asks', async () => {
    const user = userEvent.setup()
    render(<ImageUploadField value="" onChange={() => {}} uploadUrl="/api/submissions/photo" challenge />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['x'], 'p.jpg', { type: 'image/jpeg' }))
    expect(challenge.mounted).toContain('interaction-only')
    act(() => challenge.solve!('tok-1'))
    await user.click(screen.getByText('Confirm crop'))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].get('turnstileToken')).toBe('tok-1')
    expect(challenge.resets).toBe(1)

    act(() => challenge.solve!('tok-2'))
    await pickAndConfirm(user)
    await waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1].get('turnstileToken')).toBe('tok-2')
  })

  it('waits for the challenge when the crop is confirmed before it has answered', async () => {
    const user = userEvent.setup()
    render(<ImageUploadField value="" onChange={() => {}} uploadUrl="/api/submissions/photo" challenge />)
    await pickAndConfirm(user)
    await new Promise((r) => setTimeout(r, 20))
    expect(sent).toHaveLength(0)
    act(() => challenge.solve!('late'))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].get('turnstileToken')).toBe('late')
  })

  it('runs none for an uploader that isn’t challenged (the admin’s own)', async () => {
    const user = userEvent.setup()
    render(<ImageUploadField value="" onChange={() => {}} uploadUrl="/api/admin/site-settings/logo" token="admin" />)
    await pickAndConfirm(user)
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].has('turnstileToken')).toBe(false)
    expect(challenge.mounted).toEqual([])
  })
})

describe('every uploader to the public photo route', () => {
  it('runs the challenge', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name)
        return e.isDirectory() ? files(p) : /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [p] : []
      })
    const unchallenged = files(join(process.cwd(), 'src'))
      .flatMap((f) => {
        const src = readFileSync(f, 'utf8')
        return [...src.matchAll(/<ImageUploadField\b[\s\S]*?\/>/g)]
          .filter((m) => m[0].includes('/api/submissions/photo') && !/\bchallenge\b/.test(m[0]))
          .map(() => relative(process.cwd(), f))
      })
    expect(unchallenged).toEqual([])
  })
})
