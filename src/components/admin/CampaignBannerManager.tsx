'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { parseOkJson } from '@/lib/fetchJson'
import { useCommunitySlug, useCommunityTimezone } from '@/lib/communityContext'
import { useAdminApi } from './useAdminApi'
import { useNow } from '@/lib/useNow'
import type { CategoryConfig } from '@/lib/categories'
import { activeCampaignBanner, type CampaignBanner } from '@/lib/campaignBanner'
import { AdminBack, AdminBox, AdminField, AdminRow, adminInputClass } from './AdminUI'
import SaveBar, { LEAVE_QUESTION, useLeaveGuard } from './SaveBar'
import { AddListButton } from './DragList'

// ── The 'campaigns' tab: seasonal promotions (a "Sukkah Map" every Sukkot,
// or whatever the next one-off is) — a title/subtitle, a link to an existing
// category, a start/end date, and which of the banner's two CTAs (Map View,
// Browse Listings — CampaignBannerCard shows both, always) leads as the
// solid/primary button. Visibility is purely that date range (see
// campaignBanner.ts's activeCampaignBanner)
// — no separate on/off flag, so there's nothing here to toggle besides the
// dates themselves. While a banner's window is open: the home screen shows
// it (CampaignBannerCard), the map gives its category a distinctly-styled
// chip right after "All" (ResourceMapView) regardless of destination, AND
// the linked category itself becomes visible in the normal grid/nav even if
// it's set inactive (categoryStore.ts's listCategories) — so a category
// meant to exist ONLY for this campaign (Sukkahs, say) can stay hidden the
// rest of the year with nothing else to remember.
//
// A list of campaigns, each opening a screen of its own (board "Campaigns"):
// its fields, the banner beside, and one Save bar. The desktop banner's
// photo is the sukkah (CampaignBannerCard), the same for every campaign, so
// the screen shows it rather than offering a choice.

type FormState = {
  categoryId: string
  title: string
  subtitle: string
  startDate: string
  endDate: string
  destination: 'list' | 'map'
}

const EMPTY_FORM: FormState = {
  categoryId: '',
  title: '',
  subtitle: '',
  startDate: '',
  endDate: '',
  destination: 'map',
}

// The campaigns and categories as last loaded, kept between screens, as
// CategoryManager keeps its list. Each campaign is its own address, and a
// new address is a new CampaignBannerManager, so opening one, or Add,
// waited on both loads again behind "Loading…" (CI, Nov 21: still loading
// at 5s). The kept copy shows at once; the screen still asks again, and
// what comes back replaces it.
let kept: { community: string; banners: CampaignBanner[]; categories: CategoryConfig[] } | null = null

/** Tests: nothing kept from the one before. */
export function forgetCampaigns(): void {
  kept = null
}

export default function CampaignBannerManager({
  token,
  openId,
  onOpen,
  onClose,
}: {
  token: string
  /** The campaign open (its id, or 'new'), or null for the list. */
  openId: string | null
  onOpen: (id: string) => void
  onClose: () => void
}) {
  const api = useAdminApi(token)
  const timezone = useCommunityTimezone()
  const now = useNow()
  // Deliberately NOT useCategories()/ContentProvider — that reads the
  // public, filtered listCategories(), which hides an inactive category
  // unless a currently-LIVE campaign already promotes it (see
  // categoryStore.ts's own listCategories). A brand-new hidden category has
  // no campaign yet, so it would never appear here to link one in the first
  // place — the exact chicken-and-egg this admin-only fetch avoids. Same
  // /api/admin/categories route (listCategoriesUncached, everything
  // regardless of active) CategoryManager.tsx uses for its own list.
  const community = useCommunitySlug()
  const keptHere = kept?.community === community ? kept : null
  const [categories, setCategories] = useState<CategoryConfig[] | null>(keptHere?.categories ?? null)
  const listingCategories = (categories ?? []).filter((c) => c.kind === 'listing')

  const [banners, setBanners] = useState<CampaignBanner[] | null>(keptHere?.banners ?? null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setError(null)
    try {
      const [bannersBody, categoriesBody] = await Promise.all([
        parseOkJson<{ banners: CampaignBanner[] }>(await api.fetch('/api/admin/campaign-banners'), 'Failed to load campaign banners.'),
        parseOkJson<{ categories: CategoryConfig[] }>(await api.fetch('/api/admin/categories'), 'Failed to load categories.'),
      ])
      setBanners(bannersBody.banners)
      setCategories(categoriesBody.categories)
      kept = { community, banners: bannersBody.banners, categories: categoriesBody.categories }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [api, community])

  useLoadOnMount(load)

  function categoryLabel(id: string): string {
    const c = listingCategories.find((c) => c.id === id)
    if (!c) return id
    return c.active === false ? `${c.pluralLabel} (hidden)` : c.pluralLabel
  }

  if (error && !banners) return <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p>
  if (!banners) return <p className="text-sm text-muted">Loading…</p>

  const banner = openId && openId !== 'new' ? banners.find((b) => b.id === openId) : undefined
  if (openId === 'new' || banner) {
    return (
      <CampaignScreen
        key={openId}
        token={token}
        banner={banner ?? null}
        listingCategories={listingCategories}
        onDone={onClose}
        onBack={onClose}
      />
    )
  }

  const live = now === null ? null : activeCampaignBanner(banners, now, timezone)
  return (
    <AdminBox title="Campaigns">
      <p className="m-0 px-4 pt-3 text-[0.8125rem] text-slate-600">A banner on the home page between two dates, leading to one category, like a Sukkah map.</p>
      {banners.length === 0 ? (
        <p className="m-0 px-4 py-4 text-[0.9375rem] text-slate-600">{listingCategories.length === 0 ? 'Make a category first.' : 'No campaigns yet.'}</p>
      ) : (
        [...banners]
          .sort((a, b) => b.startDate.localeCompare(a.startDate))
          .map((b) => (
            <AdminRow
              key={b.id}
              onClick={() => onOpen(b.id)}
              name={b.title}
              line={`${categoryLabel(b.categoryId)} · ${dateRange(b.startDate, b.endDate)}`}
              aside={live?.id === b.id && <span className="rounded-full border border-green-200 bg-green-50 px-2 py-px text-xs font-semibold text-green-800">On now</span>}
            />
          ))
      )}
      <div className="px-4 pb-4 pt-2">
        <AddListButton onClick={() => onOpen('new')} disabled={listingCategories.length === 0}>
          Add a campaign
        </AddListButton>
      </div>
    </AdminBox>
  )
}

function CampaignScreen({
  token,
  banner,
  listingCategories,
  onDone,
  onBack,
}: {
  token: string
  banner: CampaignBanner | null
  listingCategories: CategoryConfig[]
  /** Saved or deleted: back to the list, which reads them afresh. */
  onDone: () => void
  onBack: () => void
}) {
  const api = useAdminApi(token)
  const isNew = banner === null
  const start: FormState = banner
    ? { categoryId: banner.categoryId, title: banner.title, subtitle: banner.subtitle, startDate: banner.startDate, endDate: banner.endDate, destination: banner.destination }
    : EMPTY_FORM
  const [form, setForm] = useState<FormState>(start)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [askingDelete, setAskingDelete] = useState(false)

  const changes = (Object.keys(start) as (keyof FormState)[]).filter((k) => form[k] !== start[k]).length
  const dirty = changes > 0
  useLeaveGuard(dirty)

  function leave() {
    if (dirty && !window.confirm(LEAVE_QUESTION)) return
    onBack()
  }

  async function save() {
    setError(null)
    if (!form.title.trim()) return setError('Give it a title.')
    if (!form.categoryId) return setError('Pick the category it opens.')
    if (!form.startDate || !form.endDate) return setError('Pick when it starts and ends.')
    if (form.startDate > form.endDate) return setError('It has to end on or after the day it starts.')

    setSaving(true)
    try {
      await api.send(isNew ? 'POST' : 'PATCH', isNew ? '/api/admin/campaign-banners' : `/api/admin/campaign-banners/${banner.id}`, form, 'Could not save the campaign.')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the campaign.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!banner) return
    setSaving(true)
    try {
      await api.send('DELETE', `/api/admin/campaign-banners/${banner.id}`, undefined, 'Could not delete the campaign.')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the campaign.')
      setSaving(false)
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <div className="flex flex-col gap-4">
      <AdminBack back={{ label: 'Campaigns', onClick: leave }} title={isNew ? 'New campaign' : banner.title} />
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <AdminBox>
            <div data-testid="campaign-banner-form" className="p-4 flex flex-col gap-4">
              <AdminField label="Title">
                <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Sukkah Map" className={adminInputClass} />
              </AdminField>
              <AdminField label="Subtitle">
                <input value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="Find open sukkahs to visit this Sukkot" className={adminInputClass} />
              </AdminField>
              <AdminField label="Opens">
                <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={adminInputClass}>
                  <option value="">Pick a category</option>
                  {listingCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.active === false ? `${c.pluralLabel} (hidden)` : c.pluralLabel}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="Button first">
                <select value={form.destination} onChange={(e) => set('destination', e.target.value === 'list' ? 'list' : 'map')} className={adminInputClass}>
                  <option value="map">Map View</option>
                  <option value="list">Browse Listings</option>
                </select>
              </AdminField>
              {/* min-w-0: a date input's own width otherwise pushes Ends off a phone's card. */}
              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <AdminField label="Starts">
                    <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={adminInputClass} />
                  </AdminField>
                </div>
                <div className="flex-1 min-w-0">
                  <AdminField label="Ends">
                    <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={adminInputClass} />
                  </AdminField>
                </div>
              </div>
              {/* On a phone there's no room beside the form, so the banner as it
                  will look sits under the dates instead (the user, Nov 15). */}
              <div className="lg:hidden">
                <BannerPreview title={form.title} subtitle={form.subtitle} />
              </div>
            </div>
          </AdminBox>
          {!isNew &&
            (askingDelete ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[0.9375rem] text-slate-900">Delete {banner.title}?</span>
                <button type="button" onClick={remove} disabled={saving} className="min-h-11 px-4 rounded-lg bg-red-600 text-white text-[0.9375rem] font-semibold cursor-pointer disabled:opacity-60">
                  Delete it
                </button>
                <button type="button" onClick={() => setAskingDelete(false)} className="min-h-11 px-4 rounded-lg border border-slate-300 bg-white text-[0.9375rem] font-semibold text-slate-900 cursor-pointer">
                  Leave it
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setAskingDelete(true)} className="self-start min-h-11 px-4 rounded-lg border border-slate-300 bg-white text-[0.9375rem] font-semibold text-red-700 cursor-pointer">
                Delete this campaign
              </button>
            ))}
        </div>
        <aside aria-label="Preview" className="hidden lg:block w-[340px] shrink-0 sticky top-8">
          <BannerPreview title={form.title} subtitle={form.subtitle} />
        </aside>
      </div>
      {error && <p className="m-0 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <SaveBar
        changes={isNew ? 1 : changes}
        saving={saving}
        onUndo={isNew ? leave : () => setForm(start)}
        onSave={save}
        {...(isNew && { status: 'Not saved', undoLabel: 'Throw away' })}
      />
    </div>
  )
}

/** The desktop banner's photo (CampaignBannerCard). */
const BANNER_PHOTO = '/images/sukkah-banner.webp'

/** "Oct 1 – Oct 10" from two 'YYYY-MM-DD' dates, the year added when it
 *  isn't this one. */
export function dateRange(from: string, to: string): string {
  const thisYear = new Date().getFullYear()
  const day = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y === thisYear ? {} : { year: 'numeric' }) })
  }
  return `${day(from)} – ${day(to)}`
}

/** The banner as the home will show it, with the words typed so far. */
function BannerPreview({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div data-testid="campaign-banner-preview" className="overflow-hidden rounded-[10px] border border-slate-200 bg-white">
      <div className="relative h-[140px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed preview of the banner, nothing to optimize */}
        <img src={BANNER_PHOTO} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/40 to-transparent" />
        <div className="absolute inset-x-3 bottom-2.5">
          <p className="m-0 text-[0.9375rem] font-bold text-slate-900">{title || 'Sukkah Map'}</p>
          <p className="m-0 text-[0.75rem] text-slate-700">{subtitle || 'Find open sukkahs to visit this Sukkot'}</p>
        </div>
      </div>
      <p className="m-0 border-t border-slate-200 px-3 py-2.5 text-[0.78125rem] text-slate-600">Shows at the top of the home page between the two dates</p>
    </div>
  )
}
