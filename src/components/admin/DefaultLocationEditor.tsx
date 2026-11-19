'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { useAdminApi } from './useAdminApi'
import { staticMapUrl } from '@/lib/staticMap'
import AddressInput from '@/components/intake/AddressInput'
import { AdminBox, AdminEmpty } from './AdminUI'

// Settings › Default location (Nov 19): where a visitor is taken to be
// until they set their own location — what distances, the home's zmanim and
// the map start from. One field, the same place picker visitors use for
// their own location; picking a place and saving moves it, and the time
// zone follows the place. The community's name and region don't change.

type Stored = { center: { lat: number; lng: number }; label: string | null; region: string; timezone: string }

const MAP_HEIGHT = 160

/** "Eastern Time", for a time zone's id. */
export function timeZoneName(timezone: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date(0))
      .find((p) => p.type === 'timeZoneName')
    return part?.value ?? timezone
  } catch {
    return timezone
  }
}

function SpotMap({ at }: { at: { lat: number; lng: number } }) {
  const [failed, setFailed] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const w = box.current?.clientWidth
    if (w) setWidth(w)
  }, [])
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  // Where Google won't draw it (no key, or a key it refuses on localhost),
  // no map rather than a broken image.
  if (!key || failed) return null
  return (
    <div ref={box} data-testid="default-location-map" className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-100" style={{ height: MAP_HEIGHT }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Google's own
          image service, which its terms don't let us keep (staticMap.ts). */}
      {width && <img src={staticMapUrl(at, key, { width, height: MAP_HEIGHT }, 13)} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />}
    </div>
  )
}

export default function DefaultLocationEditor({ token }: { token: string }) {
  const api = useAdminApi(token)
  const [stored, setStored] = useState<Stored | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const body = await api.get<Stored>('/api/admin/default-location', 'Could not load the default location.')
      setStored(body)
      // Until an admin has picked a place, it's the city the community was
      // made with, which is its region.
      setText(body.label ?? body.region)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }, [api])
  useLoadOnMount(load)

  async function save() {
    if (!picked || !stored) return
    const message = 'Could not save the default location.'
    setSaving(true)
    setError(null)
    try {
      const body = await api.send<{ center: Stored['center']; label: string; timezone: string }>(
        'PUT',
        '/api/admin/default-location',
        { ...picked, label: text },
        message,
      )
      setStored({ ...stored, center: body.center, label: body.label, timezone: body.timezone })
      setText(body.label)
      setPicked(null)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : message)
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <AdminEmpty>{loadError}</AdminEmpty>
  if (!stored) return <AdminEmpty>Loading…</AdminEmpty>

  const at = picked ?? stored.center
  return (
    <div className="flex flex-col gap-4">
      <AdminBox>
        <div className="p-4">
          <label htmlFor="default-location" className="block text-[13px] font-semibold text-slate-700 mb-1.5">
            Until a visitor sets their own location, we use
          </label>
          <AddressInput
            id="default-location"
            value={text}
            onChange={(v) => {
              setText(v)
              setSaved(false)
            }}
            // A typed place with no pick has no coordinates, so nothing to save.
            onCoords={(c) => setPicked(c)}
            placeholder="A neighbourhood, address or city"
            preferPlaceName
          />
          <SpotMap key={`${at.lat},${at.lng}`} at={at} />
          <p className="m-0 mt-3 text-[14px] text-slate-600">{timeZoneName(stored.timezone)}</p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!picked || saving}
              className="min-h-11 px-4 rounded-lg bg-primary text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saved && <span className="text-[14px] font-semibold text-emerald-700">Saved</span>}
          </div>
          {error && <p className="m-0 mt-3 text-[13px] text-red-700">{error}</p>}
        </div>
      </AdminBox>
    </div>
  )
}
