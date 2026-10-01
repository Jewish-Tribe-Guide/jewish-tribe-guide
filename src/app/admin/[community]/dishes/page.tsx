'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import MainDishes from '@/components/admin/MainDishes'

export default function AdminMainDishesPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <MainDishes token={session.access_token} />
    </div>
  )
}
