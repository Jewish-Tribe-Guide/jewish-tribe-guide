'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import MainDishes from '@/components/admin/MainDishes'

// The Watches tab's Main dishes page: what was the Main dishes tab (the
// user, Oct 21). /<community>/admin/dishes redirects here (next.config.ts).
export default function AdminDishesPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <MainDishes token={session.access_token} />
    </div>
  )
}
