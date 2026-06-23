import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'

// Builds the lowercased text blob a listing is searched against — shared by the
// landing-page "Places" search and every category directory's own search box, so
// the two never drift. Covers:
//   • name + address (street / neighborhood)
//   • every tag field's values, plus its `_sometimes` companion array
//   • scalar text/textarea/select detail fields (denomination, kosher cert, …)
//
// When the category config is known we walk its declared fields (precise, low
// noise). Without it we fall back to grabbing every string-array value generically
// so the landing search still works before config has loaded.
export function listingSearchText(item: DirectoryResource, category?: CategoryConfig): string {
  const parts: string[] = [item.name]
  if (item.address) parts.push(item.address)

  if (category) {
    for (const f of category.detailFields) {
      const v = item[f.key]
      if (f.type === 'tags') {
        if (Array.isArray(v)) parts.push(...(v as string[]))
        const sometimes = item[f.key + '_sometimes']
        if (Array.isArray(sometimes)) parts.push(...(sometimes as string[]))
      } else if (f.type === 'text' || f.type === 'textarea' || f.type === 'select') {
        if (typeof v === 'string' && v) parts.push(v)
      }
    }
  } else {
    for (const value of Object.values(item)) {
      if (Array.isArray(value) && value.every((x) => typeof x === 'string')) {
        parts.push(...(value as string[]))
      }
    }
  }

  return parts.join(' ').toLowerCase()
}
