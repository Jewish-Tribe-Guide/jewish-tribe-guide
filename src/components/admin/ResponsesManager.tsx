'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FormConfig } from '@/lib/forms'
import type { InboxResponse } from '@/lib/inbox'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import ResponseCard from '@/components/responses/ResponseCard'

// Responses for Feedback and any custom admin-created form (support/volunteer
// excluded — those are hospital-facing and live in /inbox instead, see
// /api/inbox's explicit requestTypes allowlist). Mounted as the 'responses'
// tab in /admin — reuses the admin session already established there, no
// separate login. Unlike /inbox's InboxTabs (one fetch, grouped client-side),
// tabs here are dynamic (grows with however many forms exist), so each tab's
// responses are fetched only when it's selected.

const PROTECTED_FORM_IDS = new Set(['support', 'volunteer'])
const FEEDBACK_KEY = '__feedback__'

export default function ResponsesManager({ token }: { token: string }) {
  const [forms, setForms] = useState<FormConfig[] | null>(null)
  const [formsError, setFormsError] = useState<string | null>(null)
  const [activeKey, setActiveKey] = useState<string>(FEEDBACK_KEY)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/forms', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return
        if (!body.ok) throw new Error(body.errors?.join(' ') || 'Failed to load forms.')
        setForms((body.forms as FormConfig[]).filter((f) => !PROTECTED_FORM_IDS.has(f.id)))
      })
      .catch((err) => {
        if (!cancelled) setFormsError(err instanceof Error ? err.message : 'Failed to load forms.')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const tabs: { key: string; label: string }[] = [
    { key: FEEDBACK_KEY, label: 'Feedback' },
    ...(forms ?? []).map((f) => ({ key: f.id, label: f.title })),
  ]

  return (
    <div>
      <p className="text-sm text-muted mb-4">
        Feedback and responses to any custom form you’ve created. Support, Volunteer, and Volunteer
        changes are hospital-facing — those live in{' '}
        <a href="/inbox" target="_blank" rel="noopener noreferrer" className="text-primary underline">
          /inbox
        </a>{' '}
        instead.
      </p>

      {formsError && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{formsError}</p>
      )}

      <div className="flex flex-wrap gap-1 mb-5 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveKey(t.key)}
            className={`text-sm font-medium px-3 py-2 -mb-px border-b-2 transition-colors cursor-pointer ${
              activeKey === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ResponsesList
        key={activeKey}
        token={token}
        query={activeKey === FEEDBACK_KEY ? { feedback: true } : { formId: activeKey }}
      />
    </div>
  )
}

function ResponsesList({
  token,
  query,
}: {
  token: string
  query: { feedback: true } | { formId: string }
}) {
  const [items, setItems] = useState<InboxResponse[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setItems(null)
    try {
      const params = 'feedback' in query ? 'feedback=1' : `formId=${encodeURIComponent(query.formId)}`
      const body = await fetchJson<{ responses: InboxResponse[] }>(
        `/api/admin/responses?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
        'Failed to load.',
      )
      setItems(body.responses)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
    // query is a fresh object each render; stringify-free re-run is driven by
    // ResponsesManager remounting this component via `key={activeKey}` instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useLoadOnMount(load)

  function handleUpdated(updated: InboxResponse) {
    setItems((prev) => prev?.map((it) => (it.id === updated.id ? updated : it)) ?? prev)
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev?.filter((it) => it.id !== id) ?? prev)
    setExpandedId((cur) => (cur === id ? null : cur))
  }

  return (
    <div>
      {error && (
        <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>
      )}

      {items === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Nothing here yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ResponseCard
              key={item.id}
              item={item}
              token={token}
              apiBase="/api/admin/responses"
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId((id) => (id === item.id ? null : item.id))}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </div>
  )
}
