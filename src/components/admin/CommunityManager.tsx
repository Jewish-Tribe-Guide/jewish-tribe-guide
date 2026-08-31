'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { adminBase } from '@/lib/adminNav'
import type { Community } from '@/lib/communityStore'

// ── The 'communities' tab: lists every community this site hosts, and lets
// an admin create a new one — either starting empty or cloning an existing
// community's categories + home sections as a starting shape. Reads from the
// PUBLIC GET /api/communities (same data the header switcher uses; nothing
// here is admin-only to read, only to create) and writes through the admin-
// only POST /api/admin/communities. ──

// Mirrors categoryStore.slugify/formStore.slugify — small enough not worth
// sharing, and those two live in server-only modules (getAdminClient, which
// must never reach the client bundle) that a Client Component can't import.
function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const DEFAULT_THEME_COLOR = '#1d4ed8'
const DEFAULT_BACKGROUND_COLOR = '#f8fafc'
const DEFAULT_ADMIN_EMAIL = 'phillyjewishguide@gmail.com'

type Draft = {
  name: string
  slug: string
  slugTouched: boolean
  tagline: string
  mission: string
  region: string
  timezone: string
  lat: string
  lng: string
  themeColor: string
  backgroundColor: string
  adminEmail: string
  cloneFrom: string
}

function emptyDraft(): Draft {
  return {
    name: '',
    slug: '',
    slugTouched: false,
    tagline: '',
    mission: '',
    region: '',
    timezone: 'America/New_York',
    lat: '',
    lng: '',
    themeColor: DEFAULT_THEME_COLOR,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    adminEmail: DEFAULT_ADMIN_EMAIL,
    cloneFrom: '',
  }
}

export default function CommunityManager({ token }: { token: string }) {
  const router = useRouter()
  const [communities, setCommunities] = useState<Community[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft())

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/communities')
      const body = await parseOkJson<{ communities: Community[] }>(res, 'Failed to load communities.')
      setCommunities(body.communities)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [])

  useLoadOnMount(load)

  function startCreating() {
    setDraft(emptyDraft())
    setFormErrors([])
    setCreating(true)
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function setName(name: string) {
    setDraft((d) => ({ ...d, name, slug: d.slugTouched ? d.slug : slugify(name) }))
  }

  function setSlug(slug: string) {
    setDraft((d) => ({ ...d, slug, slugTouched: true }))
  }

  async function submit() {
    setFormErrors([])

    const lat = Number(draft.lat)
    const lng = Number(draft.lng)
    const errs: string[] = []
    if (!draft.name.trim()) errs.push('Name is required.')
    if (!draft.slug.trim()) errs.push('URL slug is required.')
    if (!draft.region.trim()) errs.push('Region is required.')
    if (!draft.tagline.trim()) errs.push('Tagline is required.')
    if (!draft.mission.trim()) errs.push('Mission is required.')
    if (draft.lat.trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      errs.push('Map center latitude must be a number between -90 and 90.')
    }
    if (draft.lng.trim() === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      errs.push('Map center longitude must be a number between -180 and 180.')
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.themeColor.trim())) errs.push('Brand color must be a hex value like #1d4ed8.')
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.backgroundColor.trim())) {
      errs.push('Background color must be a hex value like #f8fafc.')
    }
    if (errs.length) {
      setFormErrors(errs)
      return
    }

    setSaving(true)
    try {
      const body = await fetchJson<{ community: Community }>(
        '/api/admin/communities',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            slug: draft.slug.trim(),
            name: draft.name.trim(),
            tagline: draft.tagline.trim(),
            mission: draft.mission.trim(),
            region: draft.region.trim(),
            timezone: draft.timezone.trim(),
            mapCenter: { lat, lng },
            themeColor: draft.themeColor.trim(),
            backgroundColor: draft.backgroundColor.trim(),
            adminEmail: draft.adminEmail.trim() || undefined,
            cloneFrom: draft.cloneFrom || null,
          }),
        },
        'Could not create community.',
      )
      // Lands the admin directly in the new community's own console — the
      // whole point of this flow is "click a button, get a working site",
      // and that's most visible standing inside it.
      router.push(adminBase(body.community.slug))
    } catch (err) {
      setFormErrors([err instanceof Error ? err.message : 'Could not create community.'])
    } finally {
      setSaving(false)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!communities) return <p className="text-sm text-muted">Loading communities…</p>

  const inputClass =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1'

  if (creating) {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">New community</h2>

        {formErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-1">
            {formErrors.map((e) => (
              <p key={e} className="text-sm text-red-700">
                {e}
              </p>
            ))}
          </div>
        )}

        <label className={labelClass}>
          Name
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Baltimore Jewish Community"
          />
        </label>

        <label className={labelClass}>
          URL slug
          <input className={inputClass} value={draft.slug} onChange={(e) => setSlug(e.target.value)} placeholder="baltimore" />
          <span className="block text-xs text-muted mt-1">
            The site will be at /{draft.slug || 'slug'} and /{draft.slug || 'slug'}/admin.
          </span>
        </label>

        <label className={labelClass}>
          Tagline
          <input
            className={inputClass}
            value={draft.tagline}
            onChange={(e) => set('tagline', e.target.value)}
            placeholder="Guide for residents & visitors"
          />
        </label>

        <label className={labelClass}>
          Mission
          <textarea
            className={inputClass}
            rows={2}
            value={draft.mission}
            onChange={(e) => set('mission', e.target.value)}
            placeholder="A guide to Jewish Baltimore — kosher food, shuls, and Shabbos times."
          />
        </label>

        <label className={labelClass}>
          Region
          <input className={inputClass} value={draft.region} onChange={(e) => set('region', e.target.value)} placeholder="Baltimore" />
        </label>

        <label className={labelClass}>
          Timezone
          <input
            className={inputClass}
            value={draft.timezone}
            onChange={(e) => set('timezone', e.target.value)}
            placeholder="America/New_York"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Map center latitude
            <input className={inputClass} value={draft.lat} onChange={(e) => set('lat', e.target.value)} placeholder="39.3690" />
          </label>
          <label className={labelClass}>
            Map center longitude
            <input className={inputClass} value={draft.lng} onChange={(e) => set('lng', e.target.value)} placeholder="-76.7150" />
          </label>
        </div>
        <p className="text-xs text-muted -mt-2">
          Search the neighborhood on Google Maps, right-click the middle of it, and click the lat/lng at the top of the menu.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Brand color
            <input className={inputClass} value={draft.themeColor} onChange={(e) => set('themeColor', e.target.value)} />
          </label>
          <label className={labelClass}>
            Background color
            <input className={inputClass} value={draft.backgroundColor} onChange={(e) => set('backgroundColor', e.target.value)} />
          </label>
        </div>

        <label className={labelClass}>
          Admin email
          <input className={inputClass} value={draft.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} />
          <span className="block text-xs text-muted mt-1">
            Not enforced yet — every admin can still edit every community. Captured for later.
          </span>
        </label>

        <label className={labelClass}>
          Starting content
          <select className={inputClass} value={draft.cloneFrom} onChange={(e) => set('cloneFrom', e.target.value)}>
            <option value="">Start empty</option>
            {communities.map((c) => (
              <option key={c.slug} value={c.slug}>
                Clone from {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2 pt-2">
          <button
            onClick={submit}
            disabled={saving}
            className="text-sm font-medium bg-primary text-white rounded-md px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Creating…' : 'Create community'}
          </button>
          <button
            onClick={() => setCreating(false)}
            disabled={saving}
            className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-4 py-2 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted">Every community this site hosts.</p>
        <button
          onClick={startCreating}
          className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          + New community
        </button>
      </div>

      <div className="space-y-3">
        {communities.map((c) => (
          <a
            key={c.slug}
            href={adminBase(c.slug)}
            className="block bg-white border border-slate-200 rounded-lg shadow-sm p-4 hover:border-primary transition-colors"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-900 text-sm">{c.name}</p>
              {c.isDefault && (
                <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">Default</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              /{c.slug} · {c.region}
            </p>
          </a>
        ))}
      </div>
    </div>
  )
}
