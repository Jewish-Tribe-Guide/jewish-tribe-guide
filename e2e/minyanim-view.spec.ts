import { expect, test } from '@playwright/test'
import { categories, defaultCommunity, dismissLocationPrompt } from './helpers'

// The Minyanim view, reached from Synagogues' "Minyanim by time" row, is a
// step Back undoes (Oct 6). It used to replace the address, so the
// browser's Back, and a phone's swipe, left Synagogues altogether.
test('the Minyanim view is a step: Back returns to the shuls, not out of them', async ({ page, request, isMobile }) => {
  const community = await defaultCommunity(page)
  const all = (await categories(request, community)) as (Awaited<ReturnType<typeof categories>>[number] & { detailFields?: { type: string }[] })[]
  const shuls = all.find((c) => c.detailFields?.some((f) => f.type === 'minyanim'))
  test.skip(!shuls, 'no category with minyanim')

  await page.goto(`/${community}/${shuls!.id}`)
  await dismissLocationPrompt(page)
  const row = page.getByTestId('next-minyan')
  test.skip((await row.count()) === 0, 'no minyanim listed')

  await row.click()
  await expect(page.getByTestId('minyanim-view')).toBeVisible()
  expect(new URL(page.url()).searchParams.get('davening')).toBe('1')
  // Its name is the page's title: the header's on a phone, the heading's on a computer.
  if (!isMobile) await expect(page.getByRole('heading', { level: 1 })).toHaveText('Minyanim by time')

  await page.goBack()
  await expect(page.getByTestId('minyanim-view')).toHaveCount(0)
  await expect(row).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(`/${community}/${shuls!.id}`)
  expect(new URL(page.url()).searchParams.get('davening')).toBeNull()
})
