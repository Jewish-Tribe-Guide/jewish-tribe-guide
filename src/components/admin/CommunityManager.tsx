'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { adminBase } from '@/lib/adminNav'
import type { Community } from '@/lib/communityStore'

// GET /api/admin/communities adds adminEmail on top of the plain Community
// shape (see that route's own comment) — never on Community itself, since
// that type also feeds the public GET /api/communities.
type CommunityWithAdminEmail = Community & { adminEmail: string | null }

// ── The 'communities' tab: lists every community this site hosts, and lets
// an admin create a new one — either starting empty or cloning an existing
// community's categories + home sections as a starting shape. Superadmin
// only, both for reading (GET /api/admin/communities, not the public
// /api/communities the header switcher uses) and writing (POST
// /api/admin/communities) — browsing/creating communities isn't scoped to
// any one community's own admin, so it's gated by the global ADMIN_EMAILS
// list rather than adminAuth.ts's per-community check. A regular
// per-community admin gets a 401 from the GET and sees a plain
// access-denied message instead of the list. ──

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
  // Same signal the DELETE route itself enforces (see
  // /api/admin/communities/[slug]/route.ts) — checked here too so the
  // button doesn't even appear against the real deployment, rather than
  // existing only to fail with a 403 when clicked. NEXT_PUBLIC_VERCEL_ENV
  // is the client-safe mirror of the server's VERCEL_ENV, same pattern
  // instrumentation-client.ts's Sentry gate already uses. Unset locally
  // (npm run dev, a local production build) and on preview deployments, so
  // deletion stays available everywhere except the live site. Read inside
  // the component (not module scope) purely so tests can toggle it with
  // vi.stubEnv — Next.js inlines NEXT_PUBLIC_ vars at build time either way,
  // so this makes no difference to the real deployed behavior.
  const deletionDisabled = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
  const [communities, setCommunities] = useState<CommunityWithAdminEmail[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Managing every community (browsing the list, creating a new one) is a
  // superadmin action, not something scoped to whichever one community this
  // admin administers — see the GET handler's own comment in
  // /api/admin/communities/route.ts. This is what actually removes the
  // "switch to a different community's console" capability for a regular
  // admin: the endpoint below 401s for them, and this renders a plain
  // access-denied message instead of the list-of-communities-with-links.
  const [forbidden, setForbidden] = useState(false)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  // Which community's delete-confirmation panel is open, if any — and what
  // the admin has typed into its "retype the slug" field so far. Only one
  // open at a time (opening a second closes whichever was open), same
  // pattern as ArchivedListings.tsx's confirmDeleteId.
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // Which community's publish toggle is mid-flight, so its button can show
  // a busy state without a separate boolean per row.
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setForbidden(false)
    try {
      const res = await fetch('/api/admin/communities', { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401) {
        setForbidden(true)
        return
      }
      const body = await parseOkJson<{ communities: CommunityWithAdminEmail[] }>(res, 'Failed to load communities.')
      setCommunities(body.communities)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token])

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

  async function toggleVisibility(slug: string, nextVisible: boolean) {
    setTogglingSlug(slug)
    setToggleError(null)
    try {
      await fetchJson(
        `/api/admin/communities/${slug}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ visible: nextVisible }),
        },
        'Could not update visibility.',
      )
      // Unlike delete, this isn't destructive — patch the row in place
      // instead of a full reload.
      setCommunities((cs) => cs?.map((c) => (c.slug === slug ? { ...c, visible: nextVisible } : c)) ?? cs)
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Could not update visibility.')
    } finally {
      setTogglingSlug(null)
    }
  }

  function startDeleting(slug: string) {
    setDeletingSlug(slug)
    setDeleteConfirmText('')
    setDeleteError(null)
  }

  function cancelDeleting() {
    setDeletingSlug(null)
    setDeleteConfirmText('')
    setDeleteError(null)
  }

  async function confirmDelete(slug: string) {
    setDeleting(true)
    setDeleteError(null)
    try {
      await fetchJson(
        `/api/admin/communities/${slug}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ confirmSlug: slug }),
        },
        'Could not delete community.',
      )
      // A real, full reload rather than re-fetching in place. This route
      // deletes a community, which calls revalidatePublicContent() and
      // invalidates the same content tags the surrounding admin layout's
      // own listCommunities() read depends on — staying mounted and
      // soft-refetching while that lands ran into a genuine Next.js
      // Cache Components issue: the client bailed out of reconciling this
      // route (an "instant-unrendered-segment" validation error) and
      // hard-navigated away to the public site, losing this handler's own
      // continuation before it could show anything. Confirmed the DELETE
      // itself still completed when that happened — only the UI went
      // silent, which is worse than useless for an irreversible action.
      // A plain reload sidesteps the client router entirely rather than
      // fighting it, and is a small price for an action this rare.
      window.location.reload()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete community.')
    } finally {
      setDeleting(false)
    }
  }

  if (error) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (forbidden) {
    return <p className="text-sm text-muted">Only the site owner can create or browse other communities.</p>
  }
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
            Only this address can sign in to this community&rsquo;s admin console.
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

      {deletionDisabled && (
        <p className="text-xs text-muted mb-3">Deleting a community isn&rsquo;t available in production.</p>
      )}
      {toggleError && <p className="text-xs text-red-700 mb-3">{toggleError}</p>}

      <div className="space-y-3">
        {communities.map((c) => (
          <div key={c.slug} className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 hover:border-primary transition-colors">
            <div className="flex items-start justify-between gap-3">
              <a href={adminBase(c.slug)} className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-900 text-sm">{c.name}</p>
                  {c.isDefault && (
                    <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">Default</span>
                  )}
                  {c.visible ? (
                    <span className="text-xs font-medium bg-green-100 text-green-700 rounded-full px-2 py-0.5">Live</span>
                  ) : (
                    <span className="text-xs font-medium bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">Hidden</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  /{c.slug} · {c.region}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Admin login:{' '}
                  {c.adminEmail ? (
                    <span className="font-mono">{c.adminEmail}</span>
                  ) : (
                    <span className="italic">not set — falls back to the superadmin list (ADMIN_EMAILS)</span>
                  )}
                </p>
                {!c.visible && (
                  <p className="text-xs text-amber-700 mt-1">
                    Not on the switcher or sitemap yet — still reachable at {adminBase(c.slug)} and /{c.slug}.
                  </p>
                )}
              </a>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => toggleVisibility(c.slug, !c.visible)}
                  disabled={togglingSlug === c.slug}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer disabled:opacity-60"
                >
                  {togglingSlug === c.slug ? 'Saving…' : c.visible ? 'Unpublish' : 'Publish'}
                </button>
                {/* The default community can't be deleted at all (see
                    deleteCommunity's own doc) — no button rather than one
                    that always fails. */}
                {!c.isDefault && !deletionDisabled && (
                  <button
                    onClick={() => startDeleting(c.slug)}
                    className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {deletingSlug === c.slug && (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-2">
                  <p className="text-sm text-red-800">
                    This permanently deletes <span className="font-semibold">{c.name}</span> and everything in
                    it — every listing, category, form, and submission. This can&rsquo;t be undone.
                  </p>
                  <label className="block text-xs font-medium text-red-800">
                    Type <span className="font-mono">{c.slug}</span> to confirm
                    <input
                      className="mt-1 w-full rounded-md border border-red-300 px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-400"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      autoFocus
                    />
                  </label>
                  {deleteError && <p className="text-xs text-red-700">{deleteError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmDelete(c.slug)}
                      disabled={deleteConfirmText !== c.slug || deleting}
                      className="text-sm font-medium bg-red-600 text-white rounded-md px-3 py-1.5 hover:bg-red-700 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      {deleting ? 'Deleting…' : 'Delete forever'}
                    </button>
                    <button
                      onClick={cancelDeleting}
                      disabled={deleting}
                      className="text-sm font-medium border border-slate-300 text-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
