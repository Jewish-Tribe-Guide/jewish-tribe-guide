import { chromium } from 'playwright'
const [,, url, out, w = '390', h = '844'] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 })
await p.goto(url, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(5000)
const notNow = p.getByRole('button', { name: 'Not now' })
if (await notNow.count()) { await notNow.first().click(); await p.waitForTimeout(800) }
const box = await p.$('[data-testid="listing-davening"]')
if (box && process.argv.includes('--box')) await box.screenshot({ path: out })
else await p.screenshot({ path: out, fullPage: process.argv.includes('--full') })
await b.close()
