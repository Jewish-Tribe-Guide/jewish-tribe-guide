'use client'

import { useParams, useRouter } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import CategoryManager from '@/components/admin/CategoryManager'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'

// /{community}/admin/categories (list) and .../categories/<id> (editor), one
// file via an optional catch-all segment. CategoryManager already treats
// "which item is open" as one opaque string it branches on by prefix —
// 'cat:<id>', 'cat:new', 'form:<id>', 'form:new' (see CAT_PREFIX/FORM_PREFIX
// in CategoryManager.tsx) — so that string IS the URL segment here
// (.../categories/cat:new, .../categories/form:<id>, …). CategoryManager's
// own branching needs no changes at all; only where the string comes from
// (this route param, not AdminTabs' old pushState state) and where it goes
// (router.push, not history.pushState).
//
// 'use client', so params are read via useParams() — NOT the async
// `PageProps<'/admin/[community]/categories/[[...id]]'>` + `await
// props.params` convention the public [community]/* Server Components use;
// that typed helper is for async Server Components and doesn't apply to a
// client page. The community segment is read via useCommunitySlug()
// instead, same as everywhere else in the admin console.
export default function AdminCategoriesPage() {
  const session = useAdminSession()
  const community = useCommunitySlug()
  const router = useRouter()
  const params = useParams<{ id?: string[] }>()
  // useParams() does NOT decode a catch-all segment — 'cat:childcare' in the
  // URL bar comes back here as the literal 'cat%3Achildcare', which fails
  // CategoryManager's `startsWith(CAT_PREFIX)` check silently (no error,
  // just falls through to the list) unless decoded first.
  const editingId = params.id?.[0] ? decodeURIComponent(params.id[0]) : null

  return (
    <div>
      <AdminNav />
      <CategoryManager
        token={session.access_token}
        editingId={editingId}
        onOpenEditor={(id) => router.push(`${adminBase(community)}/categories/${id}`)}
        onCloseEditor={() => router.push(`${adminBase(community)}/categories`)}
      />
    </div>
  )
}
