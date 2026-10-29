'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import RichTextEditor from '@/components/admin/RichTextEditor'
import { pageBodyToHtml, sanitizeRichText } from '@/lib/richText'
import type { PageSlug, StaticPage } from '@/lib/pagesStore'
import { AdminBox, AdminField, adminInputClass } from './AdminUI'
import SaveBar, { LEAVE_QUESTION, useLeaveGuard } from './SaveBar'

// The admin Pages tab: edit the title and body of the site's standalone
// content pages (About, Privacy). The body is a small WYSIWYG (bold, italic,
// underline, headings, lists, links) rather than the plain textarea it started
// as — these are the two pages on the site that are genuinely *documents*, and
// a privacy policy with no headings or lists is unreadable.
//
// Bodies written before the editor existed are plain text with blank lines
// between paragraphs. `pageBodyToHtml` converts one to the equivalent markup
// on the way into the editor and is also what the public pages render with,
// so a legacy page reads identically whether or not anyone has re-saved it —
// and `editorHtml` below compares the draft against that same converted form,
// so merely opening a legacy page doesn't count as an edit.
//
// One page is open for editing at a time (board "Pages"): a switch between
// them, one Save bar, and leaving or switching with changes asks first. One
// copy serves every community (pagesStore.ts), and the screen says so.
export default function PagesEditor({ token }: { token: string }) {
  const [pages, setPages] = useState<StaticPage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeSlug, setActiveSlug] = useState<PageSlug | null>(null)
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const body = await fetchJson<{ pages: StaticPage[] }>(
        '/api/admin/pages',
        { headers: { Authorization: `Bearer ${token}` } },
        'Failed to load.',
      )
      setPages(body.pages)
      setActiveSlug((current) => current ?? body.pages[0]?.slug ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token])

  useLoadOnMount(load)

  const active = pages?.find((p) => p.slug === activeSlug) ?? null
  const savedBody = active ? pageBodyToHtml(active.body) : ''
  const current = draft ?? (active ? { title: active.title, body: savedBody } : null)
  const changes = active && draft ? Number(draft.title !== active.title) + Number(sanitizeRichText(draft.body) !== savedBody) : 0
  useLeaveGuard(changes > 0)

  function edit(next: { title: string; body: string }) {
    setDraft(next)
    setSaved(false)
  }

  function selectPage(page: StaticPage) {
    if (page.slug === activeSlug) return
    if (changes > 0 && !window.confirm(LEAVE_QUESTION)) return
    setActiveSlug(page.slug)
    setDraft(null)
    setSaved(false)
    setError(null)
  }

  async function save() {
    if (!activeSlug || !draft) return
    setSaving(true)
    setError(null)
    try {
      const body = await fetchJson<{ page: StaticPage }>(
        `/api/admin/pages/${activeSlug}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          // Sanitized here as well as in the route: this strips the styled
          // spans and stray tags a paste leaves behind, so what comes back
          // from the server matches the draft and the form settles as clean
          // rather than staying dirty against its own saved value.
          body: JSON.stringify({ title: draft.title, body: sanitizeRichText(draft.body) }),
        },
        'Save failed.',
      )
      setPages((all) => all?.map((p) => (p.slug === body.page.slug ? body.page : p)) ?? all)
      setDraft(null)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !pages) {
    return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  }
  if (!pages) {
    return <p className="text-sm text-muted">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] text-amber-900">One copy for every community</p>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Page" className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {pages.map((page) => (
            <button
              key={page.slug}
              type="button"
              aria-pressed={activeSlug === page.slug}
              onClick={() => selectPage(page)}
              className={`min-h-10 px-3.5 rounded-md text-sm font-semibold cursor-pointer ${
                activeSlug === page.slug ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {page.title}
            </button>
          ))}
        </div>
        {active && <span className="text-sm text-slate-500">Updated {updatedOn(active.updatedAt)}</span>}
      </div>

      {current && (
        <AdminBox>
          <div className="p-4 flex flex-col gap-4">
            <AdminField label="Title">
              <input value={current.title} onChange={(e) => edit({ ...current, title: e.target.value })} className={adminInputClass} />
            </AdminField>
            <RichTextEditor value={current.body} onChange={(body) => edit({ ...current, body })} ariaLabel="Page body" />
          </div>
        </AdminBox>
      )}

      <SaveBar changes={changes} saving={saving} saved={saved} error={pages && error} onUndo={() => setDraft(null)} onSave={save} />
    </div>
  )
}

/** "Aug 28", or "Aug 28, 2025" from another year. */
function updatedOn(iso: string): string {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}
