'use client'

import Link from 'next/link'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import MainDishes from '@/components/admin/MainDishes'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'

// The Watches tab's Dishes job: what was the Main dishes tab (the user,
// Oct 21). /<community>/admin/dishes redirects here (next.config.ts).
export default function AdminDishesPage() {
  const session = useAdminSession()
  const community = useCommunitySlug()
  return (
    <div>
      <AdminNav />
      <div className="space-y-3">
        <Link href={`${adminBase(community)}/watches`} className="text-sm font-semibold text-primary hover:underline">
          ‹ Watches
        </Link>
        <h2 className="text-lg font-semibold text-slate-900">Dishes</h2>
        <MainDishes token={session.access_token} />
      </div>
    </div>
  )
}
