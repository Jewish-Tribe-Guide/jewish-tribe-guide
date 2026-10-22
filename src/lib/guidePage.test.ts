import { describe, expect, it } from 'vitest'
import { guideHosts, isGuidePage } from './guidePage'

describe('the guide’s own pages', () => {
  // Mikvah Moishe Zvi's watch read the guide's own listing page for it, so
  // the listing was checked against itself (Oct 21).
  it('Moishe Zvi’s watch address is the guide’s own page', () => {
    expect(isGuidePage('https://phillyjewishguide.com/philly/mikvah?item=af8839dc-65ee-43f8-af68-436469dc644e', {})).toBe(true)
    expect(isGuidePage('http://www.phillyjewishguide.com/', {})).toBe(true)
  })

  it('the addresses Vercel gives this deployment, and a custom domain', () => {
    const env = { NEXT_PUBLIC_SITE_URL: 'https://guide.example.org/', VERCEL_URL: 'jpc-abc123.vercel.app', VERCEL_BRANCH_URL: 'jpc-git-main.vercel.app' }
    expect(guideHosts(env)).toEqual(new Set(['phillyjewishguide.com', 'guide.example.org', 'jpc-abc123.vercel.app', 'jpc-git-main.vercel.app']))
    expect(isGuidePage('https://guide.example.org/philly', env)).toBe(true)
    expect(isGuidePage('https://jpc-abc123.vercel.app/philly/food', env)).toBe(true)
  })

  it('a place’s own website isn’t, even on Vercel or with the guide’s name in it', () => {
    for (const url of ['https://lmcmikvah.org/', 'https://some-shul.vercel.app/', 'https://notphillyjewishguide.com/', 'https://phillyjewishguide.com.evil.example/', 'not a url']) {
      expect(isGuidePage(url, { VERCEL_URL: 'jpc-abc123.vercel.app' }), url).toBe(false)
    }
  })
})
