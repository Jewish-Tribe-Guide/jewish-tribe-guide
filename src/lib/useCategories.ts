'use client'

import { useEffect, useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'

// Module-level cache — the landing page, audience pages, and search bar all
// want the category list, so fetch it once per page load and share it.
let cache: CategoryConfig[] | null = null
let inflight: Promise<CategoryConfig[]> | null = null

/** The live category list, or null while loading. Failure resolves to []. */
export function useCategories(): CategoryConfig[] | null {
  const [categories, setCategories] = useState<CategoryConfig[] | null>(cache)

  useEffect(() => {
    if (cache) return
    inflight ??= fetch('/api/categories')
      .then((res) => res.json())
      .then((body) => (body.ok ? (body.categories as CategoryConfig[]) : []))
      .catch(() => [])
    let active = true
    inflight.then((cats) => {
      cache = cats
      if (active) setCategories(cats)
    })
    return () => {
      active = false
    }
  }, [])

  return categories
}
