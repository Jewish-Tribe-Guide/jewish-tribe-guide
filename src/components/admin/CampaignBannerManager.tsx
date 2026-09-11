'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import { useCategories } from '@/lib/useCategories'
import type { CampaignBanner } from '@/lib/campaignBanner'

// ── The 'campaigns' tab: seasonal promotions (a "Sukkah Map" every Sukkot,
// or whatever the next one-off is) — a title/subtitle, a link to an existing
// category, and a start/end date. Visibility is purely that date range (see
// campaignBanner.ts's activeCampaignBanner) — no separate on/off flag, so
// there's nothing here to toggle besides the dates themselves. While a
// banner's window is open, the home screen shows it (CampaignBannerCard) and
// the map gives its category a distinctly-styled chip right after "All"
// (ResourceMapView) — both read the same rows this tab writes.
//
// Immediate save per action (create/edit/delete each its own request), not
// the batched-draft style HomeSectionManager uses — this is its own
// top-level tab, not folded into another tab's shared "Save changes".

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

type FormState = { categoryId: string; title: string; subtitle: string; startDate: string; endDate: string }

const EMPTY_FORM: FormState = { categoryId: '', title: '', subtitle: '', startDate: '', endDate: '' }

export default function CampaignBannerManager({ token }: { token: string }) {
  const community = useCommunitySlug()
  const categories = useCategories()
  const listingCategories = (categories ?? []).filter((c) => c.kind === 'listing')

  const [banners, setBanners] = useState<CampaignBanner[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const body = await parseOkJson<{ banners: CampaignBanner[] }>(
        await fetch(withCommunity('/api/admin/campaign-banners', community), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        'Failed to load campaign banners.',
      )
      setBanners(body.banners)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])

  useLoadOnMount(load)

  function startCreate() {
    setEditingId('new')
    setForm({ ...EMPTY_FORM, categoryId: listingCategories[0]?.id ?? '' })
    setFormError(null)
  }

  function startEdit(banner: CampaignBanner) {
    setEditingId(banner.id)
    setForm({
      categoryId: banner.categoryId,
      title: banner.title,
      subtitle: banner.subtitle,
      startDate: banner.startDate,
      endDate: banner.endDate,
    })
    setFormError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setFormError(null)
  }

  async function save() {
    setFormError(null)
    if (!form.title.trim()) return setFormError('Title is required.')
    if (!form.categoryId) return setFormError('Choose a category.')
    if (!form.startDate || !form.endDate) return setFormError('Start and end date are required.')
    if (form.startDate > form.endDate) return setFormError('Start date must be on or before the end date.')

    setSaving(true)
    try {
      if (editingId === 'new') {
        const body = await fetchJson<{ banner: CampaignBanner }>(
          withCommunity('/api/admin/campaign-banners', community),
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          },
          'Could not create campaign banner.',
        )
        setBanners((prev) => [...(prev ?? []), body.banner])
      } else if (editingId) {
        const body = await fetchJson<{ banner: CampaignBanner }>(
          withCommunity(`/api/admin/campaign-banners/${editingId}`, community),
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          },
          'Could not update campaign banner.',
        )
        setBanners((prev) => prev?.map((b) => (b.id === editingId ? body.banner : b)) ?? prev)
      }
      setEditingId(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save campaign banner.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(banner: CampaignBanner) {
    if (!confirm(`Delete "${banner.title}"? This can't be undone.`)) return
    setDeletingId(banner.id)
    try {
      await fetchJson(
        withCommunity(`/api/admin/campaign-banners/${banner.id}`, community),
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        'Could not delete campaign banner.',
      )
      setBanners((prev) => prev?.filter((b) => b.id !== banner.id) ?? prev)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete campaign banner.')
    } finally {
      setDeletingId(null)
    }
  }

  function categoryLabel(id: string): string {
    return listingCategories.find((c) => c.id === id)?.pluralLabel ?? id
  }

  return (
    <div>
      <p className="text-sm text-muted mb-4">
        A seasonal banner — a title, a link to an existing category, and a start/end date. It shows
        up on the home screen and gets a highlighted chip on the map for exactly that date range,
        then disappears completely once the range ends. Reuse this for the next one-off promotion
        rather than building a new one.
      </p>

      {error && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">{error}</p>}

      {banners === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 max-w-2xl space-y-3">
          {banners.length === 0 && editingId !== 'new' && (
            <p className="text-sm text-muted">No campaign banners yet.</p>
          )}

          {banners.map((banner) =>
            editingId === banner.id ? (
              <CampaignBannerForm
                key={banner.id}
                form={form}
                setForm={setForm}
                listingCategories={listingCategories}
                error={formError}
                saving={saving}
                onSave={save}
                onCancel={cancelEdit}
              />
            ) : (
              <div key={banner.id} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                <div>
                  <p className="text-sm font-medium text-slate-900">{banner.title}</p>
                  <p className="text-xs text-muted">
                    {categoryLabel(banner.categoryId)} · {banner.startDate} – {banner.endDate}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => startEdit(banner)} className="text-sm font-medium text-primary hover:underline cursor-pointer">
                    Edit
                  </button>
                  <button
                    onClick={() => remove(banner)}
                    disabled={deletingId === banner.id}
                    className="text-sm font-medium text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {deletingId === banner.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ),
          )}

          {editingId === 'new' && (
            <CampaignBannerForm
              form={form}
              setForm={setForm}
              listingCategories={listingCategories}
              error={formError}
              saving={saving}
              onSave={save}
              onCancel={cancelEdit}
            />
          )}

          {editingId === null && (
            <button
              onClick={startCreate}
              disabled={listingCategories.length === 0}
              className="text-sm font-medium text-primary hover:underline cursor-pointer disabled:opacity-50 disabled:no-underline"
            >
              + Add a campaign banner
            </button>
          )}
          {listingCategories.length === 0 && (
            <p className="text-xs text-muted">Create a category first — a campaign banner always links to one.</p>
          )}
        </div>
      )}
    </div>
  )
}

function CampaignBannerForm({
  form,
  setForm,
  listingCategories,
  error,
  saving,
  onSave,
  onCancel,
}: {
  form: FormState
  setForm: (f: FormState) => void
  listingCategories: { id: string; pluralLabel: string }[]
  error: string | null
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
      {error && <p className="text-sm text-red-700">{error}</p>}
      <label className="block">
        <span className="block text-[11px] font-medium text-slate-600 mb-1">Title</span>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Sukkah Map"
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-medium text-slate-600 mb-1">Subtitle</span>
        <input
          value={form.subtitle}
          onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
          placeholder="Find open sukkahs to visit this Sukkot"
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-medium text-slate-600 mb-1">Links to</span>
        <select
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          className={inputClass}
        >
          {listingCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.pluralLabel}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        <label className="block flex-1">
          <span className="block text-[11px] font-medium text-slate-600 mb-1">Start date</span>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block flex-1">
          <span className="block text-[11px] font-medium text-slate-600 mb-1">End date</span>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            className={inputClass}
          />
        </label>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 cursor-pointer disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="text-sm font-medium text-muted hover:underline cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  )
}
