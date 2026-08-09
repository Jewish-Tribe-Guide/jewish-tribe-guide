import { describe, expect, it } from 'vitest'
import { draftSectionsAsHomeSections, isPreviewMode, previewUrl } from './previewDraft'

// The sessionStorage read/write halves need a browser and are exercised by the
// admin console; what's testable here — and what actually broke — is the URL
// and the sortOrder rebuild.

describe('previewUrl', () => {
  // "/" is an HTTP redirect (see e2e/routing.spec.ts). Pointing the preview
  // frame at "/?preview=1" and letting it redirect is exactly how the flag got
  // dropped before, landing the admin on the normal site with their unsaved
  // draft silently ignored — which reads as "preview is broken".
  it('points straight at the community, not at the "/" redirect', () => {
    expect(previewUrl('philly')).toBe('/philly?preview=1')
    expect(previewUrl('philly').startsWith('/?')).toBe(false)
  })

  it('carries the flag isPreviewMode looks for', () => {
    const url = new URL(previewUrl('philly'), 'https://example.com')
    expect(url.searchParams.get('preview')).toBe('1')
  })

  it('stays relative, so the frame inherits the origin and its sessionStorage', () => {
    expect(previewUrl('philly').startsWith('/')).toBe(true)
    expect(previewUrl('philly')).not.toMatch(/^https?:/)
  })

  it('previews the community being edited, not the default one', () => {
    expect(previewUrl('baltimore')).toContain('/baltimore')
  })
})

describe('isPreviewMode', () => {
  // Always false on the server, so an admin's draft can never leak into the
  // prerendered HTML that visitors are served.
  it('is false with no window, so it cannot affect server rendering', () => {
    expect(isPreviewMode()).toBe(false)
  })
})

describe('draftSectionsAsHomeSections', () => {
  it('rebuilds sortOrder from array position, which is the editor’s source of truth', () => {
    const sections = draftSectionsAsHomeSections([
      { id: 'b', title: 'Food', cardIds: ['grocery'] },
      { id: 'a', title: 'Places to Stay', cardIds: ['hotel'] },
    ])
    expect(sections.map((s) => [s.title, s.sortOrder])).toEqual([
      ['Food', 0],
      ['Places to Stay', 1],
    ])
  })

  it('keeps the title and cards untouched', () => {
    const [section] = draftSectionsAsHomeSections([{ id: 'a', title: 'Food', cardIds: ['grocery', 'restaurant'] }])
    expect(section.id).toBe('a')
    expect(section.cardIds).toEqual(['grocery', 'restaurant'])
  })

  it('handles an empty list', () => {
    expect(draftSectionsAsHomeSections([])).toEqual([])
  })
})
