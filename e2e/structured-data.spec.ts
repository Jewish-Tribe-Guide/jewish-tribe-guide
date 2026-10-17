import { expect, test, type APIRequestContext } from '@playwright/test'
import { categoryWithListings, defaultCommunity } from './helpers'

// The JSON-LD has to be in the HTML the server sends — a crawler that doesn't run
// JavaScript (or runs it late) is the whole audience for it. So this fetches the
// document with request.get() rather than driving a browser, and reads the
// markup out of the raw response: serverMarkup() strips <script> contents on
// purpose (for content assertions), which is exactly what's being looked at here.

type Node = Record<string, unknown>

async function jsonLd(request: APIRequestContext, path: string): Promise<Node[]> {
  const res = await request.get(path)
  expect(res.status(), path).toBe(200)
  const html = await res.text()

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
  expect(blocks.length, `${path} should ship a JSON-LD block`).toBeGreaterThan(0)

  // Every block must be valid JSON — a stray `<` or trailing comma would make a
  // crawler silently discard the lot.
  return blocks.flatMap((b) => {
    const parsed = JSON.parse(b) as { '@graph'?: Node[] } & Node
    return parsed['@graph'] ?? [parsed]
  })
}

const byType = (nodes: Node[], type: string) => nodes.find((n) => n['@type'] === type)

test.describe('structured data', () => {
  test('a category page lists its places as an ItemList with a breadcrumb', async ({ request, page }) => {
    const community = await defaultCommunity(page)
    const { category, count } = await categoryWithListings(request, community)

    const nodes = await jsonLd(request, `/${community}/${category.id}`)
    const list = byType(nodes, 'ItemList')!
    expect(list, 'ItemList').toBeTruthy()
    expect(list.numberOfItems).toBe(count)
    expect((list.itemListElement as unknown[]).length).toBe(count)

    const crumbs = byType(nodes, 'BreadcrumbList')!
    expect((crumbs.itemListElement as unknown[]).length).toBe(2)
  })

  test('a listing page describes that place, and its URL is the one the category page listed', async ({ request, page }) => {
    const community = await defaultCommunity(page)
    const { category } = await categoryWithListings(request, community)

    const list = byType(await jsonLd(request, `/${community}/${category.id}`), 'ItemList')!
    const first = (list.itemListElement as { name: string; url: string }[])[0]!
    const listingPath = new URL(first.url).pathname

    const nodes = await jsonLd(request, listingPath)
    // Whatever type the category maps to, it isn't the list or the breadcrumb.
    const place = nodes.find((n) => n['@type'] !== 'BreadcrumbList' && n['@type'] !== 'ItemList')!
    expect(place, 'the place').toBeTruthy()
    expect(place.name).toBe(first.name)
    expect(new URL(place.url as string).pathname).toBe(listingPath)

    const crumbs = byType(nodes, 'BreadcrumbList')!
    expect((crumbs.itemListElement as unknown[]).length).toBe(3)
  })

  test('the home page keeps its WebSite entry', async ({ request, page }) => {
    const community = await defaultCommunity(page)
    expect(byType(await jsonLd(request, `/${community}`), 'WebSite')).toBeTruthy()
  })
})
