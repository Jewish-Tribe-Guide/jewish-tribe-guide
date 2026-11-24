import { expect, test } from '@playwright/test'
import { defaultCommunity, ready, needs } from './helpers'

// The browser's Back on the Map page (Nov 18, items 5 and 6 of the public
// review). A computer's Back with a place open left the map and its search
// altogether; a phone reloaded with a place open needed Back pressed twice
// to close it, the reload adding a second entry for the same place.

test('computer: Back closes the place open in the sidebar and stays on the map', { tag: '@desktop' }, async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  await ready(page)
  const show = page.getByRole('button', { name: 'Show sidebar' })
  const list = page.getByTestId('sidebar-scroll')
  // One or the other, before the one-shot look at which (CI looked too
  // soon, saw neither and never opened the sidebar, Nov 18).
  await expect(show.or(list.getByTestId('nearby-name').first())).toBeVisible()
  if (await show.isVisible()) await show.click()
  await list.getByTestId('nearby-name').first().click()
  const back = page.getByRole('button', { name: 'Back to results' }).filter({ visible: true })
  await expect(back).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('place')).not.toBeNull()

  await page.goBack()
  await expect(back).toHaveCount(0)
  await expect(list.getByTestId('nearby-name').first()).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(`/${community}/map`)
  expect(new URL(page.url()).searchParams.get('place')).toBeNull()

  // Closed on the screen, it takes its entry back: Back again leaves.
  await page.goForward()
  await expect(back).toBeVisible()
  await back.click()
  await expect(back).toHaveCount(0)
  await page.goBack()
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(`/${community}/map`)
})

test('phone: after a reload with a place open, one Back closes it', { tag: '@mobile' }, async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  await ready(page)
  await page.getByRole('button', { name: 'Expand nearby list' }).click()
  const list = page.getByTestId('sheet-scroll')
  await list.getByTestId('nearby-name').first().click()
  const backToList = page.getByRole('button', { name: 'Back to list' })
  await expect(backToList).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('place')).not.toBeNull()

  await page.reload()
  await ready(page)
  await expect(backToList).toBeVisible()

  await page.goBack()
  await expect(backToList).toHaveCount(0)
  expect(new URL(page.url()).pathname).toBe(`/${community}/map`)
})

// Nov 19: a place's editor is an address of its own (?editing=<id>~listing,
// useEditorInAddress), so Back is the place, Forward the editor again, and
// a reload comes back to it. Opens nothing that writes.
const editingIn = (url: string) => new URL(url).searchParams.get('editing')

test('computer: the place’s editor in the sidebar is an address of its own', { tag: '@desktop' }, async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  await ready(page)
  const show = page.getByRole('button', { name: 'Show sidebar' })
  const list = page.getByTestId('sidebar-scroll')
  await expect(show.or(list.getByTestId('nearby-name').first())).toBeVisible()
  if (await show.isVisible()) await show.click()
  await list.getByTestId('nearby-name').first().click()
  const toResults = page.getByRole('button', { name: 'Back to results' }).filter({ visible: true })
  await expect(toResults).toBeVisible()
  const edit = page.getByRole('button', { name: 'Edit listing' }).filter({ visible: true })
  needs((await edit.count()) > 0, 'the first place can’t be edited')
  const place = new URL(page.url()).searchParams.get('place')
  const editor = page.getByTestId('editor-list')

  await edit.click()
  await expect(editor).toBeVisible()
  await expect.poll(() => editingIn(page.url())).toBe(`${place}~listing`)

  await page.goBack()
  await expect(editor).toHaveCount(0)
  await expect(edit).toBeVisible()
  expect(new URL(page.url()).searchParams.get('place')).toBe(place)
  await page.goForward()
  await expect(editor).toBeVisible()

  await page.reload()
  await ready(page)
  await expect(editor).toBeVisible()
  await page.goBack()
  await expect(editor).toHaveCount(0)
  await expect(edit).toBeVisible()
  expect(editingIn(page.url())).toBeNull()
})

test('phone: the place’s editor in the sheet is an address of its own, through a reload', { tag: '@mobile' }, async ({ page }) => {
  const community = await defaultCommunity(page)
  await page.goto(`/${community}/map`)
  await ready(page)
  await page.getByRole('button', { name: 'Expand nearby list' }).click()
  await page.getByTestId('sheet-scroll').getByTestId('nearby-name').first().click()
  const backToList = page.getByRole('button', { name: 'Back to list' })
  await expect(backToList).toBeVisible()
  const edit = page.getByRole('button', { name: 'Edit listing' }).filter({ visible: true })
  needs((await edit.count()) > 0, 'the first place can’t be edited')
  const place = new URL(page.url()).searchParams.get('place')
  const editor = page.getByTestId('editor-list')

  await edit.click()
  await expect(editor).toBeVisible()
  await expect.poll(() => editingIn(page.url())).toBe(`${place}~listing`)

  await page.reload()
  await ready(page)
  await expect(editor).toBeVisible()
  await page.goBack()
  await expect(editor).toHaveCount(0)
  await expect(backToList).toBeVisible()
  await page.goBack()
  await expect(backToList).toHaveCount(0)
  expect(new URL(page.url()).pathname).toBe(`/${community}/map`)
})
