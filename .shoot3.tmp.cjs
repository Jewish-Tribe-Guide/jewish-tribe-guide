const { chromium } = require('@playwright/test')
const [out, ...paths] = process.argv.slice(2)
;(async () => {
  const b = await chromium.launch()
  for (const [name, vp] of [['desk', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp })
    const p = await ctx.newPage()
    for (const path of paths) {
      await p.goto('http://localhost:3000' + path, { waitUntil: 'load' })
      await p.waitForTimeout(3500)
      const notNow = p.getByRole('button', { name: 'Not now' })
      if (await notNow.isVisible().catch(() => false)) { await notNow.click(); await p.waitForTimeout(500) }
      const f = `${out}/${name}${path.replace(/\W+/g, '_')}.png`
      await p.screenshot({ path: f })
      console.log(f)
    }
    await ctx.close()
  }
  await b.close()
})()
