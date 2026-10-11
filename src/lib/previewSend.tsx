'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { DirectoryResource, ResourceSubmission } from '@/types'

// ── The admin console's category Preview: nothing it does goes anywhere ───
// The preview is the real directory page, so every way a visitor can send
// something is in it: a listing's editor, a box's own Edit, the "+ Add" box,
// "Still right?", an item's "Still here", Update their times, Add a minyan,
// an upvote, Request removal. Each of those sends through `useFetchOrPreview()`
// instead of `fetch`. Under this provider it answers for the route, the way
// the route would have answered a success, and makes no request: nothing
// lands in the moderation queue, nothing is stamped on a live listing, and
// no AI read is paid for. Outside it, `useFetchOrPreview()` is plain `fetch`.
//
// A listing's edit or add (useListingSubmit) is the one thing that shows:
// it's built into a listing here (previewListing) and handed to `listing`,
// which drops it into the preview's list (CategoryPreview's
// addOrReplaceLocal). Everything else looks the way it does to a visitor
// once it's sent ("Sent", "Thanks! It's marked as current"), with the
// listing unchanged, as it is for a visitor while an admin checks it.
//
// An AI read (the "+ Add" box's, Update their times', Add Sukkos times')
// answers with a refusal that says so (PREVIEW_READ_ERROR), with each one's
// own way to do it by hand ("Fill it in yourself") still there under it. A
// photo added to a listing isn't uploaded: it's shown from the browser's
// own copy.

export type PreviewSend = {
  /** A listing as Send would have filed it, to show in the preview. */
  listing: (listing: DirectoryResource) => void
}

const PreviewSendContext = createContext<PreviewSend | null>(null)

export function PreviewSendProvider({ listing, children }: { listing: (listing: DirectoryResource) => void; children: ReactNode }) {
  const value = useMemo(() => ({ listing }), [listing])
  return <PreviewSendContext.Provider value={value}>{children}</PreviewSendContext.Provider>
}

/** The preview's send, or null on the real site. */
export function usePreviewSend(): PreviewSend | null {
  return useContext(PreviewSendContext)
}

/** What an AI read says in the preview, instead of reading. */
export const PREVIEW_READ_ERROR = 'This is the preview, so nothing is read here.'

/** A route's answer, made here: `{ ok: true, ...body }`, status 200. */
export function previewAnswer(body: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

/** `fetch` for anything that writes, with the answer the preview gives in
 *  its place: `{ ok: true }` and whatever `inPreview` adds (a function,
 *  when making it costs something the real site shouldn't pay). */
export type FetchOrPreview = (
  input: string,
  init: RequestInit,
  inPreview?: Record<string, unknown> | (() => Record<string, unknown>),
) => Promise<Response>

export function useFetchOrPreview(): FetchOrPreview {
  const preview = usePreviewSend()
  return useMemo<FetchOrPreview>(
    // `fetch` looked up at the call, not here, so a test's stubbed fetch
    // is the one used.
    () =>
      preview
        ? async (_input, _init, inPreview) => previewAnswer(typeof inPreview === 'function' ? inPreview() : inPreview)
        : (input, init) => fetch(input, init),
    [preview],
  )
}

/** The listing a submission would become, as the preview shows it: an
 *  edit over the listing it edits, an add with an id of its own. The
 *  Google bookkeeping the server reads on approval is left out. */
export function previewListing(payload: ResourceSubmission, existing?: DirectoryResource): DirectoryResource {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- left out, see above
  const { googleAutofill, businessStatus, ...details } = payload.details
  return {
    ...existing,
    ...details,
    id: existing?.id || `preview-${crypto.randomUUID()}`,
    category: payload.category,
    name: payload.name,
    anchorId: payload.anchorId,
    distance: 0,
    address: payload.address,
    phone: payload.phone,
    geo: payload.geo ?? null,
  }
}
