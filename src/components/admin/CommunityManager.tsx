'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import tzLookup from 'tz-lookup'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { adminBase } from '@/lib/adminNav'
import AddressInput from '@/components/intake/AddressInput'
import type { Community } from '@/lib/communityStore'

// GET /api/admin/communities adds adminEmails/notifyOnSubmission/
// previewToken on top of the plain Community shape (see that route's own
// comment) — never on Community itself, since that type also feeds the
// public GET /api/communities.
type CommunityWithAdminEmail = Community & {
  adminEmails: string[]
  notifyOnSubmission: boolean
  // The same two preferences each admin sets for themselves on their own
  // community's Team tab (see TeamManager.tsx) — membership in these two
  // arrays, not a per-admin row (there isn't one; see communityStore.ts's
  // own notes on getAdminNotifyPreference/getAdminReviewNotifyPreference).
  // Shown here read-only, so the roster below derives each admin's two
  // states from these rather than storing anything of its own.
  notifyMutedEmails: string[]
  notifyReviewEmails: string[]
  previewToken: string | null
}

function isMuted(list: string[], email: string): boolean {
  const target = email.trim().toLowerCase()
  return list.some((e) => e.trim().toLowerCase() === target)
}

// Comma-separated, same convention the SUPERADMIN_EMAILS env var already
// uses — only still needed for the "new community" form's admin-emails
// field below; the per-community roster further down edits one address at a
// time instead.
function parseEmailList(value: string): string[] {
  return value
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
}

// ── The 'communities' tab: lists every community this site hosts, and lets
// an admin create a new one — either starting empty or cloning an existing
// community's categories + home sections as a starting shape. Superadmin
// only, both for reading (GET /api/admin/communities, not the public
// /api/communities the header switcher uses) and writing (POST
// /api/admin/communities) — browsing/creating communities isn't scoped to
// any one community's own admin, so it's gated by the global SUPERADMIN_EMAILS
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

// Matches ACCESS_PARAM/previewCookieName in src/proxy.ts — that's what
// actually enforces this link being required for a hidden community.
function previewLink(slug: string, token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/${slug}?access=${token}`
}

const DEFAULT_THEME_COLOR = '#1d4ed8'
const DEFAULT_BACKGROUND_COLOR = '#f8fafc'
const DEFAULT_TIMEZONE = 'America/New_York'

type Draft = {
  // The "City, State" picker's own controlled value (e.g. "Baltimore, MD,
  // USA") — kept separate from `name`/`region` since it drives both of
  // those, but isn't itself submitted.
  cityQuery: string
  name: string
  nameTouched: boolean
  slug: string
  slugTouched: boolean
  tagline: string
  taglineTouched: boolean
  mission: string
  missionTouched: boolean
  region: string
  regionTouched: boolean
  timezone: string
  lat: string
  lng: string
  themeColor: string
  backgroundColor: string
  adminEmails: string
  cloneFrom: string
}

function emptyDraft(): Draft {
  return {
    cityQuery: '',
    name: '',
    nameTouched: false,
    slug: '',
    slugTouched: false,
    tagline: '',
    taglineTouched: false,
    mission: '',
    missionTouched: false,
    region: '',
    regionTouched: false,
    timezone: DEFAULT_TIMEZONE,
    lat: '',
    lng: '',
    themeColor: DEFAULT_THEME_COLOR,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    // Empty rather than defaulting to any one address — every superadmin is
    // added automatically server-side (see the create route's own comment),
    // so this field is only for community-specific admins on top of that.
    adminEmails: '',
    cloneFrom: '',
  }
}

// Google's `formattedAddress` for a locality reads "Baltimore, MD, USA" —
// the part before the first comma is what a name/region/tagline actually
// wants ("Baltimore"), not the full string. Good enough for the common case;
// everything it feeds stays editable if a city's real name needs adjusting.
function cityShortName(cityQuery: string): string {
  return cityQuery.split(',')[0]?.trim() || cityQuery.trim()
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
  // Tagline/mission/region/timezone/map center/brand colors — everything
  // the city picker fills in, or that's editable later from the admin
  // console (tagline/mission via Site Settings) and so isn't worth blocking
  // creation on. Collapsed by default; opens on its own if lat/lng end up
  // missing at submit time (no city picked, e.g. Places unavailable) so the
  // manual fallback is never hidden from someone who actually needs it.
  const [detailsOpen, setDetailsOpen] = useState(false)
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
  // Which community's preview link was just copied, so the button can say
  // so briefly instead of leaving no feedback for an action with no other
  // visible effect.
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  // Which community's notify-on-submission master switch is mid-flight.
  const [togglingNotifySlug, setTogglingNotifySlug] = useState<string | null>(null)
  const [notifyToggleError, setNotifyToggleError] = useState<string | null>(null)
  // The "Add admin" input's typed value, one per community (keyed by slug)
  // so switching which card you're typing into doesn't clobber another.
  const [newAdminEmail, setNewAdminEmail] = useState<Record<string, string>>({})
  // Which community is mid-flight on an add or remove, and which email a
  // remove is acting on — enough to disable just the affected row/button
  // rather than the whole roster.
  const [rosterBusySlug, setRosterBusySlug] = useState<string | null>(null)
  const [rosterError, setRosterError] = useState<Record<string, string>>({})
  // Which single roster row (slug + email) is showing its inline "remove
  // this admin?" confirmation, if any — same one-at-a-time,
  // click-again-to-confirm shape as ArchivedListings.tsx's confirmDeleteId,
  // just keyed by a pair since the roster spans every community at once.
  const [confirmRemove, setConfirmRemove] = useState<{ slug: string; email: string } | null>(null)

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
    setDetailsOpen(false)
    setCreating(true)
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function setName(name: string) {
    setDraft((d) => ({ ...d, name, nameTouched: true, slug: d.slugTouched ? d.slug : slugify(name) }))
  }

  function setSlug(slug: string) {
    setDraft((d) => ({ ...d, slug, slugTouched: true }))
  }

  function setRegion(region: string) {
    setDraft((d) => ({ ...d, region, regionTouched: true }))
  }

  function setTagline(tagline: string) {
    setDraft((d) => ({ ...d, tagline, taglineTouched: true }))
  }

  function setMission(mission: string) {
    setDraft((d) => ({ ...d, mission, missionTouched: true }))
  }

  // The City/State field's own value — cleared coordinates (via
  // setCityCoords(null), which AddressInput calls on every keystroke after a
  // prior selection) mean whatever was picked before no longer matches what's
  // typed, same as AddressInput's own free-typed-address behavior elsewhere.
  function setCityQuery(cityQuery: string) {
    setDraft((d) => ({ ...d, cityQuery }))
  }

  // Fires when a suggestion is picked (AddressInput's onCoords), after
  // setCityQuery has already landed the chosen city's text — see that
  // function's own note on why reading d.cityQuery here is safe. Auto-fills
  // everything a real address would otherwise make an admin hunt down by
  // hand (map center, timezone, region, a starting name/slug/tagline/
  // mission), without overwriting anything already edited by hand.
  function setCityCoords(coords: { lat: number; lng: number } | null) {
    setDraft((d) => {
      if (!coords) return { ...d, lat: '', lng: '' }
      const city = cityShortName(d.cityQuery)
      const name = d.nameTouched ? d.name : `${city} Jewish Guide`
      return {
        ...d,
        lat: String(coords.lat),
        lng: String(coords.lng),
        timezone: tzLookup(coords.lat, coords.lng),
        region: d.regionTouched ? d.region : city,
        name,
        // When the name itself is being auto-filled, slugify the city alone
        // rather than the generated name — otherwise the "Jewish Guide"
        // suffix ends up baked into the URL (e.g. baltimore-jewish-guide).
        // A hand-typed name still drives the slug as before.
        slug: d.slugTouched ? d.slug : slugify(d.nameTouched ? name : city),
        tagline: d.taglineTouched ? d.tagline : 'Guide for residents & visitors',
        mission: d.missionTouched
          ? d.mission
          : `A guide to Jewish ${city} — community resources for residents and visitors.`,
      }
    })
  }

  async function submit() {
    setFormErrors([])

    const lat = Number(draft.lat)
    const lng = Number(draft.lng)
    const errs: string[] = []
    if (!draft.name.trim()) errs.push('Name is required.')
    if (!draft.slug.trim()) errs.push('URL slug is required.')
    // region/lat/lng normally arrive together from picking a city — missing
    // any of them means that never happened (no city picked, or Places
    // unavailable) and nothing was typed in manually either.
    if (!draft.region.trim()) errs.push('Region is required — pick a city above, or fill it in under "More details".')
    if (draft.lat.trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      errs.push('Map center latitude must be a number between -90 and 90 — pick a city above, or set it manually.')
    }
    if (draft.lng.trim() === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      errs.push('Map center longitude must be a number between -180 and 180 — pick a city above, or set it manually.')
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.themeColor.trim())) errs.push('Brand color must be a hex value like #1d4ed8.')
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.backgroundColor.trim())) {
      errs.push('Background color must be a hex value like #f8fafc.')
    }
    if (errs.length) {
      setFormErrors(errs)
      setDetailsOpen(true) // every field these errors point at lives in there
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
            // Never required — see the "More details" disclosure — so a
            // blank field (cleared by hand, or never auto-filled because no
            // city was picked) still needs something real to submit rather
            // than an empty string admin-visible copy would render as.
            tagline: draft.tagline.trim() || 'Guide for residents & visitors',
            mission: draft.mission.trim() || `A guide to the ${draft.region.trim() || draft.name.trim()} Jewish community.`,
            region: draft.region.trim(),
            timezone: draft.timezone.trim(),
            mapCenter: { lat, lng },
            themeColor: draft.themeColor.trim(),
            backgroundColor: draft.backgroundColor.trim(),
            adminEmails: parseEmailList(draft.adminEmails),
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
      const { community } = await fetchJson<{ community: CommunityWithAdminEmail }>(
        `/api/admin/communities/${slug}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ visible: nextVisible }),
        },
        'Could not update visibility.',
      )
      // Unlike delete, this isn't destructive — patch the row in place
      // instead of a full reload. previewToken comes from the response, not
      // just `visible` flipped locally: unpublishing rotates it server-side
      // (see setCommunityVisibility's own comment), so the old token this
      // component already had is now wrong.
      setCommunities(
        (cs) => cs?.map((c) => (c.slug === slug ? { ...c, visible: nextVisible, previewToken: community.previewToken } : c)) ?? cs,
      )
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Could not update visibility.')
    } finally {
      setTogglingSlug(null)
    }
  }

  async function copyPreviewLink(slug: string, token: string) {
    try {
      await navigator.clipboard.writeText(previewLink(slug, token))
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 2000)
    } catch {
      // Clipboard access can be denied (permissions, non-HTTPS, etc.) — the
      // input field next to the button is still there to select and copy by
      // hand, so this fails quietly rather than surfacing an error banner
      // for something this low-stakes.
    }
  }

  async function toggleNotifyOnSubmission(slug: string, next: boolean) {
    setTogglingNotifySlug(slug)
    setNotifyToggleError(null)
    try {
      const { community } = await fetchJson<{ community: CommunityWithAdminEmail }>(
        `/api/admin/communities/${slug}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ notifyOnSubmission: next }),
        },
        'Could not update the notification setting.',
      )
      setCommunities(
        (cs) => cs?.map((c) => (c.slug === slug ? { ...c, notifyOnSubmission: community.notifyOnSubmission } : c)) ?? cs,
      )
    } catch (err) {
      setNotifyToggleError(err instanceof Error ? err.message : 'Could not update the notification setting.')
    } finally {
      setTogglingNotifySlug(null)
    }
  }

  function applyRosterUpdate(slug: string, community: CommunityWithAdminEmail) {
    setCommunities(
      (cs) =>
        cs?.map((c) =>
          c.slug === slug
            ? {
                ...c,
                adminEmails: community.adminEmails,
                notifyMutedEmails: community.notifyMutedEmails,
                notifyReviewEmails: community.notifyReviewEmails,
              }
            : c,
        ) ?? cs,
    )
  }

  async function addAdmin(slug: string) {
    const email = (newAdminEmail[slug] ?? '').trim()
    if (!email) return
    setRosterBusySlug(slug)
    setRosterError((e) => ({ ...e, [slug]: '' }))
    try {
      const { community } = await fetchJson<{ community: CommunityWithAdminEmail }>(
        `/api/admin/communities/${slug}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ addAdminEmail: email }),
        },
        'Could not add that admin.',
      )
      applyRosterUpdate(slug, community)
      setNewAdminEmail((v) => ({ ...v, [slug]: '' }))
    } catch (err) {
      setRosterError((e) => ({ ...e, [slug]: err instanceof Error ? err.message : 'Could not add that admin.' }))
    } finally {
      setRosterBusySlug(null)
    }
  }

  async function removeAdmin(slug: string, email: string) {
    setConfirmRemove(null)
    setRosterBusySlug(slug)
    setRosterError((e) => ({ ...e, [slug]: '' }))
    try {
      const { community } = await fetchJson<{ community: CommunityWithAdminEmail }>(
        `/api/admin/communities/${slug}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ removeAdminEmail: email }),
        },
        'Could not remove that admin.',
      )
      applyRosterUpdate(slug, community)
    } catch (err) {
      setRosterError((e) => ({ ...e, [slug]: err instanceof Error ? err.message : 'Could not remove that admin.' }))
    } finally {
      setRosterBusySlug(null)
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

        <div>
          {/* The helper text below is deliberately OUTSIDE the <label> —
              nested inside, it becomes part of the field's accessible name
              (every other label/caption pair here does this fine, but this
              one's own caption happens to contain the word "name", which
              made getByLabel('Name') match this field too — a real
              e2e/community-editor.spec.ts failure, not just a style
              nit). */}
          <label className={labelClass}>
            City, State
            <AddressInput
              value={draft.cityQuery}
              onChange={setCityQuery}
              onCoords={setCityCoords}
              includedPrimaryTypes={['locality']}
              placeholder="e.g. Baltimore, MD"
            />
          </label>
          <p className="text-xs text-muted mt-1">
            Fills in the name, URL slug, region, timezone, map center, tagline and mission below — pick a suggestion
            from the dropdown rather than just typing, so those actually get set.
          </p>
        </div>

        <label className={labelClass}>
          Name
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Baltimore Jewish Guide"
          />
        </label>

        <label className={labelClass}>
          URL slug
          <input className={inputClass} value={draft.slug} onChange={(e) => setSlug(e.target.value)} placeholder="baltimore" />
          <span className="block text-xs text-muted mt-1">
            The site will be at /{draft.slug || 'slug'} and /{draft.slug || 'slug'}/admin.
          </span>
        </label>

        <div>
          {/* Caption deliberately OUTSIDE the <label> — same reasoning as
              the City/State field's own comment above: nested inside, it
              becomes part of the accessible name, and "new-submission"
              contains "mission" as a literal substring. That collided with
              the actual Mission field and broke
              e2e-admin-write/community-editor.spec.ts for real. */}
          <label className={labelClass}>
            Admin emails
            <input
              className={inputClass}
              value={draft.adminEmails}
              onChange={(e) => set('adminEmails', e.target.value)}
              placeholder="jane@example.com, sam@example.com"
            />
          </label>
          <p className="text-xs text-muted mt-1">
            Comma-separated. Only these addresses (plus every superadmin, added automatically) can sign in to this
            community&rsquo;s admin console — each signs in as themselves — and they&rsquo;ll get new-submission
            emails (turn that off later if not wanted).
          </p>
        </div>

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

        {/* Everything below is either already auto-filled by the city
            picker above, or safe to leave at its default — a new community
            starts unpublished (see the visibility migration), so none of
            this needs to be right, or even present, before creating it.
            Tagline/mission are editable later from Site Settings too. */}
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="text-sm font-medium text-primary hover:underline cursor-pointer"
        >
          {detailsOpen ? '− Hide' : '+ Show'} more details (tagline, mission, region, timezone, map center, colors)
        </button>

        {detailsOpen && (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <label className={labelClass}>
              Tagline
              <input
                className={inputClass}
                value={draft.tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Guide for residents & visitors"
              />
            </label>

            <label className={labelClass}>
              Mission
              <textarea
                className={inputClass}
                rows={2}
                value={draft.mission}
                onChange={(e) => setMission(e.target.value)}
                placeholder="A guide to Jewish Baltimore — kosher food, shuls, and Shabbos times."
              />
            </label>

            <label className={labelClass}>
              Region
              <input
                className={inputClass}
                value={draft.region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Baltimore"
              />
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
              Set by the city picker above. To set by hand instead: search the neighborhood on Google Maps,
              right-click the middle of it, and click the lat/lng at the top of the menu.
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
          </div>
        )}

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
      {notifyToggleError && <p className="text-xs text-red-700 mb-3">{notifyToggleError}</p>}

      <div className="space-y-3">
        {communities.map((c) => (
          <div key={c.slug} className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 hover:border-primary transition-colors">
            <div className="flex items-start justify-between gap-3">
              {/* prefetch={false}: this list can include communities other than
                  the one whose admin console is currently mounted, and
                  prefetching primes Next's client router cache for that
                  other community's segment of the same /admin/[community]
                  layout. That collided for real with the very next thing
                  this screen does — creating a community and router.push-ing
                  into its console — which silently failed to update the URL
                  (no error, no reload, just stuck) once these rows started
                  prefetching. Same underlying Cache Components router-cache
                  issue as confirmDelete's own reload workaround below, just
                  triggered by priming instead of by the delete itself. */}
              <Link href={adminBase(c.slug)} prefetch={false} className="min-w-0 flex-1">
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
                {!c.visible && (
                  <p className="text-xs text-amber-700 mt-1">
                    Not on the switcher or sitemap, and the public site 404s for anyone without the link below. The
                    admin console works normally regardless — sign in any time to keep building it out.
                  </p>
                )}
              </Link>
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

            {!c.visible && c.previewToken && (
              <div className="mt-3 border-t border-slate-200 pt-3 flex items-center gap-2">
                <input
                  readOnly
                  value={previewLink(c.slug, c.previewToken)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-mono text-slate-600"
                />
                <button
                  onClick={() => copyPreviewLink(c.slug, c.previewToken!)}
                  className="text-xs font-medium border border-slate-300 text-slate-600 rounded-md px-2.5 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
                >
                  {copiedSlug === c.slug ? 'Copied!' : 'Copy link'}
                </button>
              </div>
            )}

            <div className="mt-3 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs font-semibold text-slate-700">Admins</p>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={c.notifyOnSubmission}
                    disabled={togglingNotifySlug === c.slug}
                    onChange={(e) => toggleNotifyOnSubmission(c.slug, e.target.checked)}
                    className="cursor-pointer disabled:cursor-not-allowed"
                  />
                  Email on new submissions
                </label>
              </div>

              {rosterError[c.slug] && <p className="text-xs text-red-700 mb-2">{rosterError[c.slug]}</p>}

              {c.adminEmails.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="font-medium pb-1">Email</th>
                      <th className="font-medium pb-1 text-center w-24">Submissions</th>
                      <th className="font-medium pb-1 text-center w-24">Approve/reject</th>
                      <th className="w-14" />
                    </tr>
                  </thead>
                  <tbody>
                    {c.adminEmails.map((email) => {
                      const submissionsOn = !isMuted(c.notifyMutedEmails, email)
                      const reviewOn = isMuted(c.notifyReviewEmails, email)
                      const confirming = confirmRemove?.slug === c.slug && confirmRemove.email === email
                      return (
                        <tr key={email} className="border-t border-slate-100">
                          <td className="py-1.5 font-mono text-slate-700">{email}</td>
                          <td className="py-1.5 text-center">
                            <span
                              className={
                                submissionsOn
                                  ? 'inline-block rounded-full px-2 py-0.5 bg-green-50 text-green-700'
                                  : 'inline-block rounded-full px-2 py-0.5 bg-slate-100 text-slate-500'
                              }
                            >
                              {submissionsOn ? 'On' : 'Off'}
                            </span>
                          </td>
                          <td className="py-1.5 text-center">
                            <span
                              className={
                                reviewOn
                                  ? 'inline-block rounded-full px-2 py-0.5 bg-green-50 text-green-700'
                                  : 'inline-block rounded-full px-2 py-0.5 bg-slate-100 text-slate-500'
                              }
                            >
                              {reviewOn ? 'On' : 'Off'}
                            </span>
                          </td>
                          <td className="py-1.5 text-right">
                            {confirming ? (
                              <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                <button
                                  onClick={() => removeAdmin(c.slug, email)}
                                  disabled={rosterBusySlug === c.slug}
                                  className="font-medium text-red-600 hover:underline cursor-pointer disabled:opacity-60"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setConfirmRemove(null)}
                                  className="font-medium text-slate-500 hover:underline cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmRemove({ slug: c.slug, email })}
                                className="font-medium text-red-600 hover:underline cursor-pointer"
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No admins set — falls back to the superadmin list (SUPERADMIN_EMAILS).
                </p>
              )}

              <div className="flex gap-2 mt-2">
                <input
                  className="flex-1 min-w-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
                  value={newAdminEmail[c.slug] ?? ''}
                  onChange={(e) => setNewAdminEmail((v) => ({ ...v, [c.slug]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addAdmin(c.slug)}
                  placeholder="new-admin@example.com"
                  type="email"
                />
                <button
                  onClick={() => addAdmin(c.slug)}
                  disabled={rosterBusySlug === c.slug || !(newAdminEmail[c.slug] ?? '').trim()}
                  className="text-xs font-medium border border-slate-300 text-slate-600 rounded-md px-2.5 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60 cursor-pointer shrink-0"
                >
                  Add admin
                </button>
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
