import { expect, test, type Page } from '@playwright/test'
import { categoryWithMapPoints, listingWithFourActions, ready, settled } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// How much a screen jumps while it loads (Cumulative Layout Shift). The
// target is 0.1 at p75 (docs/speed-targets.md); Sentry measured 0.19 on the
// live site (Nov 24), from too few visits to say which screen, so this
// loads each main screen and adds up every shift itself.
//
// Each shift the browser reports names the elements that moved, so a
// failure says what jumped and by how much, not just a number.
//
// Counted from the first paint until the screen has settled and a moment
// more, for what arrives late (the map, photos, the location prompt). A
// shift right after a tap or a key doesn't count, as in the real metric.
// ─────────────────────────────────────────────────────────────────────────────

const TARGET = 0.1

type Shift = { value: number; at: number; moved: string[] }

async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const describe = (n: Node | null) => {
      if (!(n instanceof Element)) return n ? n.nodeName : '(gone)'
      const id = n.id ? `#${n.id}` : ''
      const test = n.getAttribute('data-testid') ?? n.getAttribute('data-spot')
      const cls = typeof n.className === 'string' ? n.className.split(/\s+/).filter(Boolean).slice(0, 4).join('.') : ''
      const text = (n.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
      return `${n.tagName.toLowerCase()}${id}${test ? `[${test}]` : ''}${cls ? `.${cls}` : ''}${text ? ` "${text}"` : ''}`
    }
    const shifts: unknown[] = ((window as unknown as { __shifts: unknown[] }).__shifts = [])
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean; startTime: number; sources?: { node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] }[]) {
        if (e.hadRecentInput) continue
        shifts.push({ value: e.value, at: Math.round(e.startTime), moved: (e.sources ?? []).map((s) => `${describe(s.node)} y ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)}, h ${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)}`) })
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
}

async function shiftsOf(page: Page, path: string): Promise<Shift[]> {
  await watchShifts(page)
  await page.goto(path)
  await ready(page)
  await settled(page)
  // What arrives after the code: the map's tiles, photos, the zmanim.
  await page.waitForTimeout(2_500)
  await settled(page)
  return page.evaluate(() => (window as unknown as { __shifts: Shift[] }).__shifts)
}

function report(shifts: Shift[]): string {
  return shifts
    .filter((s) => s.value >= 0.001)
    .map((s) => `  ${s.value.toFixed(3)} at ${s.at}ms: ${s.moved.join(' | ')}`)
    .join('\n')
}

async function expectSteady(page: Page, path: string) {
  const shifts = await shiftsOf(page, path)
  const total = shifts.reduce((sum, s) => sum + s.value, 0)
  expect(total, `${path} jumped ${total.toFixed(3)} (target ${TARGET}):\n${report(shifts)}`).toBeLessThanOrEqual(TARGET)
}

test('the home page doesn’t jump as it loads', async ({ page }) => {
  await expectSteady(page, '/philly')
})

test('a category page with a map doesn’t jump as it loads', async ({ page, request }) => {
  const { category } = await categoryWithMapPoints(request, 'philly')
  await expectSteady(page, `/philly/${category.id}`)
})

test('a listing’s own page doesn’t jump as it loads', async ({ page, request }) => {
  const { category, item } = await listingWithFourActions(request, 'philly')
  await expectSteady(page, `/philly/${category.id}/${item.id}`)
})

test('the map doesn’t jump as it loads', async ({ page }) => {
  await expectSteady(page, '/philly/map')
})
