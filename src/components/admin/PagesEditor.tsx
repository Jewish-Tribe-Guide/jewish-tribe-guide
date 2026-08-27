'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import RichTextEditor from '@/components/admin/RichTextEditor'
import { pageBodyToHtml, sanitizeRichText } from '@/lib/richText'
import type { PageSlug, StaticPage } from '@/lib/pagesStore'

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

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
// One page is open for editing at a time; switching pages discards an unsaved
// edit on the one you're leaving, same as the rest of the admin console does
// for unsaved drafts elsewhere.
export default function PagesEditor({ token }: { token: string }) {
  const [pages, setPages] = useState<StaticPage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeSlug, setActiveSlug] = useState<PageSlug | null>(null)
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedNotice, setSavedNotice] = useState(false)

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

  function selectPage(page: StaticPage) {
    setActiveSlug(page.slug)
    setDraft({ title: page.title, body: pageBodyToHtml(page.body) })
    setSavedNotice(false)
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
      setSavedNotice(true)
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

  const active = pages.find((p) => p.slug === activeSlug) ?? null
  const savedBody = active ? pageBodyToHtml(active.body) : ''
  const current = draft ?? (active ? { title: active.title, body: savedBody } : null)
  const dirty =
    !!active && !!draft && (draft.title !== active.title || sanitizeRichText(draft.body) !== savedBody)

  return (
    <div>
      <p className="text-sm text-muted mb-4">
        The site&rsquo;s standalone pages — About and Privacy — linked from the footer rather than the
        main navigation. Formatting is limited to what the toolbar offers; pasted text comes in
        unformatted on purpose.
      </p>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      <div className="mb-4 inline-flex gap-0.5 rounded-md border border-slate-300 p-0.5">
        {pages.map((page) => (
          <button
            key={page.slug}
            onClick={() => selectPage(page)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
              activeSlug === page.slug ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {page.title}
          </button>
        ))}
      </div>

      {current && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 max-w-2xl">
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Title</span>
            <input
              value={current.title}
              onChange={(e) => setDraft({ ...current, title: e.target.value })}
              className={inputClass}
            />
          </label>
          <div>
            <span className="block text-xs font-medium text-slate-700 mb-1">Body</span>
            <RichTextEditor
              value={current.body}
              onChange={(body) => setDraft({ ...current, body })}
              ariaLabel="Page body"
            />
          </div>
        </div>
      )}

      {current && (
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="text-sm font-medium bg-primary text-white rounded-md px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            onClick={() => active && selectPage(active)}
            disabled={saving || !dirty}
            className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
          >
            Cancel
          </button>
          {savedNotice && !dirty && <span className="text-sm text-green-700">Saved.</span>}
        </div>
      )}
    </div>
  )
}
