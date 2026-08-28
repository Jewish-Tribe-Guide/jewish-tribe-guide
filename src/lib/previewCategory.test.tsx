// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ContentProvider, PreviewCategoryProvider, useCategories } from '@/lib/contentContext'
import { getCategoryColor } from '@/lib/categoryColor'
import { makeCategory, makeContent } from '@/test/providerFixtures'
import { renderWithProviders } from '@/test/renderWithProviders'

// The admin's category preview renders the real map and directory, which read
// colour/icon off the shared categories list rather than off the draft handed
// down as a prop — so an unsaved colour change showed the old pin colour until
// PreviewCategoryProvider spliced the draft into that list.

function ShowColor({ id }: { id: string }) {
  const categories = useCategories()
  const category = categories.find((c) => c.id === id)
  return (
    <div>
      <span data-testid="color">{getCategoryColor(categories, id)}</span>
      <span data-testid="label">{category?.pluralLabel ?? 'missing'}</span>
      <span data-testid="count">{categories.length}</span>
    </div>
  )
}

afterEach(cleanup)

describe('PreviewCategoryProvider', () => {
  const saved = [
    makeCategory({ id: 'grocery', pinColor: '#111111' }),
    makeCategory({ id: 'mikvah', pluralLabel: 'Mikvahs', pinColor: '#222222' }),
  ]

  it('resolves the draft colour, not the saved one', () => {
    renderWithProviders(
      <PreviewCategoryProvider category={{ ...saved[1], pinColor: '#abcdef' }}>
        <ShowColor id="mikvah" />
      </PreviewCategoryProvider>,
      { content: { categories: saved } },
    )
    expect(screen.getByTestId('color')).toHaveTextContent('#abcdef')
  })

  it('leaves the other categories alone', () => {
    renderWithProviders(
      <PreviewCategoryProvider category={{ ...saved[1], pinColor: '#abcdef' }}>
        <ShowColor id="grocery" />
      </PreviewCategoryProvider>,
      { content: { categories: saved } },
    )
    expect(screen.getByTestId('color')).toHaveTextContent('#111111')
    expect(screen.getByTestId('count')).toHaveTextContent('2')
  })

  it('keeps the draft at the saved row position, so the positional fallback is stable', () => {
    // No pinColor on either: the colour comes from the index in the list, and
    // replacing in place (rather than appending) has to preserve it.
    const list = [makeCategory({ id: 'grocery' }), makeCategory({ id: 'mikvah' })]
    renderWithProviders(
      <PreviewCategoryProvider category={{ ...list[1], pluralLabel: 'Renamed' }}>
        <ShowColor id="mikvah" />
      </PreviewCategoryProvider>,
      { content: { categories: list } },
    )
    expect(screen.getByTestId('color')).toHaveTextContent(getCategoryColor(list, 'mikvah'))
    expect(screen.getByTestId('label')).toHaveTextContent('Renamed')
  })

  it('appends a brand-new category that has never been saved', () => {
    renderWithProviders(
      <PreviewCategoryProvider category={makeCategory({ id: 'brand-new', pinColor: '#abcdef' })}>
        <ShowColor id="brand-new" />
      </PreviewCategoryProvider>,
      { content: { categories: saved } },
    )
    expect(screen.getByTestId('color')).toHaveTextContent('#abcdef')
    expect(screen.getByTestId('count')).toHaveTextContent('3')
  })
})

// Guards the referential stability useCategories' own memo depends on: the
// editor rebuilds the draft object every render, so keying the merge on
// identity would hand the map a new categories array each time.
describe('PreviewCategoryProvider identity', () => {
  it('returns the same categories array when the draft is rebuilt unchanged', () => {
    const seen: unknown[] = []
    function Capture() {
      seen.push(useCategories())
      return null
    }
    // Rendered without renderWithProviders: its `rerender` re-renders the ui
    // alone, dropping the providers it wrapped the first render in.
    const content = makeContent()
    const tree = (
      <ContentProvider content={content}>
        <PreviewCategoryProvider category={makeCategory({ pinColor: '#abcdef' })}>
          <Capture />
        </PreviewCategoryProvider>
      </ContentProvider>
    )
    const { rerender } = render(tree)
    rerender(
      <ContentProvider content={content}>
        <PreviewCategoryProvider category={makeCategory({ pinColor: '#abcdef' })}>
          <Capture />
        </PreviewCategoryProvider>
      </ContentProvider>,
    )
    expect(seen.length).toBeGreaterThan(1)
    expect(seen[1]).toBe(seen[0])
  })
})
