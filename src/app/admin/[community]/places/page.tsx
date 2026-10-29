'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import PlacesList from '@/components/admin/PlacesList'

export default function AdminPlacesPage() {
  const session = useAdminSession()
  return <PlacesList token={session.access_token} />
}
