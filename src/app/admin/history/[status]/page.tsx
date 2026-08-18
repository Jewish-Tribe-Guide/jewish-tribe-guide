'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import SubmissionHistory from '@/components/admin/SubmissionHistory'

// /admin/history/approved and /admin/history/rejected — what the Metrics
// tab's tiles link to. 'use client', so the status comes from useParams(),
// same as /admin/categories/[[...id]] — no Suspense boundary needed (that's
// only a useSearchParams requirement).
export default function AdminHistoryPage() {
  const session = useAdminSession()
  const params = useParams<{ status: string }>()
  const status = params.status === 'approved' || params.status === 'rejected' ? params.status : null

  return (
    <div>
      <AdminNav />
      {status ? (
        <SubmissionHistory token={session.access_token} status={status} />
      ) : (
        <p className="text-sm text-red-700">
          Unknown status &ldquo;{params.status}&rdquo;.{' '}
          <Link href="/admin/metrics" className="underline">
            Back to Metrics
          </Link>
        </p>
      )}
    </div>
  )
}
