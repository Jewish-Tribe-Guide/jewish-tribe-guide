import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'

export type PageSlug = 'about' | 'privacy'

export const PAGE_SLUGS: PageSlug[] = ['about', 'privacy']

export type StaticPage = {
  slug: PageSlug
  title: string
  body: string
  updatedAt: string
}

type Row = {
  slug: string
  title: string
  body: string
  updated_at: string
}

function toPage(row: Row): StaticPage {
  return { slug: row.slug as PageSlug, title: row.title, body: row.body, updatedAt: row.updated_at }
}

// Uncached — used by the admin editor (read-after-write consistency) and by
// updatePage's merge-before-save, same reasoning as getSiteSettingsUncached.
export async function getPageUncached(slug: PageSlug): Promise<StaticPage | null> {
  const { data, error } = await getAdminClient().from('page').select('*').eq('slug', slug).maybeSingle()
  if (error) throw new Error(`Failed to load page "${slug}": ${error.message}`)
  return data ? toPage(data as Row) : null
}

// Cached for the public /about and /privacy routes.
export async function getPage(slug: PageSlug): Promise<StaticPage | null> {
  'use cache'
  cacheTag(TAGS.pages)
  cacheLife('days')
  return getPageUncached(slug)
}

export async function listPagesUncached(): Promise<StaticPage[]> {
  const { data, error } = await getAdminClient().from('page').select('*').order('slug')
  if (error) throw new Error(`Failed to load pages: ${error.message}`)
  return (data as Row[]).map(toPage)
}

export async function updatePage(slug: PageSlug, patch: { title?: string; body?: string }): Promise<StaticPage> {
  const current = await getPageUncached(slug)
  const title = patch.title ?? current?.title ?? slug
  const body = patch.body ?? current?.body ?? ''

  const { data, error } = await getAdminClient()
    .from('page')
    .upsert({ slug, title, body, updated_at: new Date().toISOString() }, { onConflict: 'slug' })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to update page "${slug}": ${error.message}`)
  return toPage(data as Row)
}
