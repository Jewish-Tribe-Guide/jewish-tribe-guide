import { describe, expect, it } from 'vitest'
import { linkOrigin } from './linkOrigin'

const req = (origin?: string, url = 'https://deploy-abc.vercel.app/api/admin/request-link') =>
  new Request(url, { method: 'POST', headers: origin ? { origin } : {} })
const env = { VERCEL_URL: 'deploy-abc.vercel.app', VERCEL_BRANCH_URL: 'guide-git-branch.vercel.app' }

describe('linkOrigin', () => {
  it('uses the request’s own address with no Origin, or a broken one', () => {
    expect(linkOrigin(req(), env)).toBe('https://deploy-abc.vercel.app')
    expect(linkOrigin(req('not a url'), env)).toBe('https://deploy-abc.vercel.app')
  })

  it('takes Origin when it is one of the guide’s own addresses', () => {
    expect(linkOrigin(req('https://phillyjewishguide.com'), env)).toBe('https://phillyjewishguide.com')
    expect(linkOrigin(req('https://www.phillyjewishguide.com'), env)).toBe('https://www.phillyjewishguide.com')
    expect(linkOrigin(req('https://guide-git-branch.vercel.app'), env)).toBe('https://guide-git-branch.vercel.app')
  })

  it('never takes another site, or a look-alike of the guide', () => {
    for (const o of ['https://evil.example', 'https://phillyjewishguide.com.evil.example', 'https://evilphillyjewishguide.com', 'http://phillyjewishguide.com', 'https://other.vercel.app'])
      expect(linkOrigin(req(o), env)).toBe('https://deploy-abc.vercel.app')
  })

  it('takes a local dev server’s own Origin', () => {
    expect(linkOrigin(req('http://localhost:3000', 'http://localhost:3000/api/admin/request-link'), {})).toBe('http://localhost:3000')
  })
})
