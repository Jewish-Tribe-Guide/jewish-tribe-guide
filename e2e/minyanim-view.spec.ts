import { expect, test } from '@playwright/test'
import { categories, defaultCommunity, dismissLocationPrompt } from './helpers'

// The Minyanim view, reached from Synagogues' "Synagogue | Minyan"
// switch (Nov 11; the green "Minyanim by time" row before), is a step Back
// undoes (Oct 6). It used to replace the address, so the browser's Back,
// and a phone's swipe, left Synagogues altogether. A reload and Forward land
// on it too: a screen of its own is an entry in the browser's history.
test('the Minyanim view is a step: Back returns to the shuls, Forward and a reload to the view', async ({ page, request }) => {
  const community = await defaultCommunity(page)
  const all = (await categories(request, community)) as (Awaited<ReturnType<typeof categories>>[number] & { detailFields?: { type: string }[] })[]
  // Any category with a minyanim field; the switch shows once one of its
  // listings keeps times (the test project's Food has the field, no times).
  const candidates = all.filter((c) => c.detailFields?.some((f) => f.type === 'minyanim'))
  const switchEl = page.getByTestId('minyan-switch')
  let shuls: (typeof candidates)[number] | undefined
  for (const c of candidates) {
    await page.goto(`/${community}/${c.id}`)
    await dismissLocationPrompt(page)
    // The switch takes the count heading's place; wait for one or the other.
    await expect(switchEl.or(page.getByRole('heading', { level: 2 })).first()).toBeVisible()
    if ((await switchEl.count()) > 0) {
      shuls = c
      break
    }
  }
  test.skip(!shuls, 'no listing keeps minyan times')

  const byTime = switchEl.getByRole('button', { name: 'Minyan' })
  const view = page.getByTestId('minyanim-view')

  // As tall as Filters beside it (the user, Nov 11: "Yes, match it").
  const filters = page.getByTestId('list-heading').filter({ visible: true }).getByRole('button', { name: /^Filters/ })
  if ((await filters.count()) > 0) {
    const [a, b] = [await switchEl.filter({ visible: true }).first().boundingBox(), await filters.first().boundingBox()]
    expect(Math.round(a!.height), 'the switch is as tall as Filters').toBe(Math.round(b!.height))
  }

  await byTime.click()
  await expect(view).toBeVisible()
  await expect(byTime).toHaveAttribute('aria-pressed', 'true')
  expect(new URL(page.url()).searchParams.get('davening')).toBe('1')

  await page.reload()
  await dismissLocationPrompt(page)
  await expect(view).toBeVisible()
  await expect(byTime).toHaveAttribute('aria-pressed', 'true')

  await page.goBack()
  await expect(view).toHaveCount(0)
  await expect(byTime).toHaveAttribute('aria-pressed', 'false')
  expect(new URL(page.url()).pathname).toBe(`/${community}/${shuls!.id}`)
  expect(new URL(page.url()).searchParams.get('davening')).toBeNull()

  await page.goForward()
  await expect(view).toBeVisible()
  expect(new URL(page.url()).searchParams.get('davening')).toBe('1')
})
