'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import { fetchJson } from '@/lib/fetchJson'
import type { NightKindId } from '@/lib/jobRuns'
import { withCommunity } from '@/lib/useCommunityData'
import { jobLists } from '@/lib/watchJobList'
import { AdminBack, AdminBox, AdminEmpty, AdminRow } from './AdminUI'
import { useWatchJobsAndReload } from './useWatchJobs'

// + Add a watch: everything not already on Watches. A job turned off comes
// back on with a tap, and Other pages opens to add a page.

export default function AddWatchPage({ token }: { token: string }) {
  const community = useCommunitySlug()
  const router = useRouter()
  const base = adminBase(community)
  const { jobs } = useWatchJobsAndReload(token)
  const [error, setError] = useState<string | null>(null)
  const back = <AdminBack back={{ label: 'Watches', href: `${base}/watches` }} title="Add a watch" />
  if (!jobs.runs || !jobs.categories) return <div className="space-y-4">{back}<p className="text-sm text-muted">Loading…</p></div>
  const { more } = jobLists(jobs.categories, jobs.runs.kinds, jobs.runs.off ?? [])

  async function turnOn(kind: NightKindId) {
    setError(null)
    try {
      await fetchJson(
        withCommunity('/api/admin/watches', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'job-on', kind }) },
        'Could not turn it on.',
      )
      router.push(`${base}/watches`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn it on.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {back}
      {error && <p className="m-0 text-sm text-red-700">{error}</p>}
      {more.length === 0 ? (
        <AdminEmpty>Nothing left to add.</AdminEmpty>
      ) : (
        <AdminBox>
          {more.map((m) => (m.off ? <AdminRow key={m.id} onClick={() => void turnOn(m.id)} name={m.name} line="Turned off" aside="Turn on" /> : <AdminRow key={m.id} href={`${base}/watches/job/${m.id}`} name={m.name} />))}
        </AdminBox>
      )}
    </div>
  )
}
