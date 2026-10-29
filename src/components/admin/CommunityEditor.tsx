'use client'

import { useCallback, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import type { SiteSettings } from '@/lib/siteSettings'
import { useCommunitySlug } from '@/lib/communityContext'
import { withCommunity } from '@/lib/useCommunityData'
import ImageUploadField from '@/components/ImageUploadField'
import { AdminBox, AdminField, adminInputClass } from './AdminUI'
import SaveBar, { useLeaveGuard } from './SaveBar'

// Settings' Community tab (the admin redesign's step 5): the guide's name
// and logo, rarely touched, so behind the gear rather than in Site's Header
// and menus. Site settings, saved through /api/admin/site-settings, only
// these two keys.

type NameAndLogo = Pick<SiteSettings, 'name' | 'logoUrl'>

const pick = (s: SiteSettings): NameAndLogo => ({ name: s.name, logoUrl: s.logoUrl })

export default function CommunityEditor({ token }: { token: string }) {
  const community = useCommunitySlug()
  const [saved, setSaved] = useState<NameAndLogo | null>(null)
  const [draft, setDraft] = useState<NameAndLogo | null>(null)
  const [logoOriginal, setLogoOriginal] = useState<File | string | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(withCommunity('/api/admin/site-settings', community), { headers: { Authorization: `Bearer ${token}` } })
      const body = await parseOkJson<{ settings: SiteSettings }>(res, 'Failed to load.')
      setSaved(pick(body.settings))
      setDraft(pick(body.settings))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [token, community])
  useLoadOnMount(load)

  const changes = saved && draft ? (['name', 'logoUrl'] as const).filter((k) => saved[k] !== draft[k]).length : 0
  useLeaveGuard(changes > 0)

  function set<K extends keyof NameAndLogo>(key: K, value: NameAndLogo[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
    setJustSaved(false)
  }

  async function save() {
    if (!draft) return
    setError(null)
    setSaving(true)
    try {
      const body = await fetchJson<{ settings: SiteSettings }>(
        withCommunity('/api/admin/site-settings', community),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(draft),
        },
        'Save failed.',
      )
      setSaved(pick(body.settings))
      setDraft(pick(body.settings))
      setJustSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (!draft) {
    return error ? <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-muted">Loading…</p>
  }

  return (
    <div className="max-w-[840px] flex flex-col gap-4">
      <AdminBox title="Name and logo">
        <div className="flex flex-col gap-4 p-4">
          <AdminField label="Name">
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} className={adminInputClass} />
          </AdminField>
          <div>
            <span className="block text-[13px] font-semibold text-slate-700 mb-1.5">Logo</span>
            <ImageUploadField
              value={draft.logoUrl ?? ''}
              onChange={(url) => set('logoUrl', url || null)}
              uploadUrl={withCommunity('/api/admin/site-settings/logo', community)}
              token={token}
              shape="square"
              originalSource={logoOriginal}
              onOriginalSourceChange={setLogoOriginal}
            />
          </div>
        </div>
      </AdminBox>
      <SaveBar
        changes={changes}
        saving={saving}
        saved={justSaved}
        error={error}
        onUndo={() => {
          setDraft(saved)
          setError(null)
        }}
        onSave={save}
      />
    </div>
  )
}
