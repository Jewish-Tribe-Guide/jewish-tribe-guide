import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { askGmail, readWebAppLink, sentOn } from './gmailNow'

describe('readWebAppLink', () => {
  it('takes a script’s web app link and nothing else: the site will fetch it', () => {
    expect(readWebAppLink(' https://script.google.com/macros/s/AKfy_1-x/exec ')).toBe('https://script.google.com/macros/s/AKfy_1-x/exec')
    expect(readWebAppLink('https://script.google.com/a/macros/shul.org/s/AKfy/exec')).toBeNull()
    expect(readWebAppLink('https://script.google.com/a/shul.org/macros/s/AKfy/exec')).toBe('https://script.google.com/a/shul.org/macros/s/AKfy/exec')
    expect(readWebAppLink('https://script.google.com.evil.example/macros/s/AKfy/exec')).toBeNull()
    expect(readWebAppLink('http://script.google.com/macros/s/AKfy/exec')).toBeNull()
    expect(readWebAppLink('http://169.254.169.254/')).toBeNull()
    expect(readWebAppLink(undefined)).toBeNull()
  })
})

describe('askGmail', () => {
  const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it('sends the key and the address', async () => {
    const f = reply({ ok: true, account: 'guide@gmail.com', email: null })
    expect(await askGmail('https://x/exec', 'nl_k', 'office@ohev.org', f)).toEqual({ ok: true, account: 'guide@gmail.com', email: null })
    const init = vi.mocked(f).mock.calls[0][1]!
    expect(JSON.parse(String(init.body))).toEqual({ key: 'nl_k', address: 'office@ohev.org' })
  })

  it('wrong key, a sign-in page or a dead link: no answer', async () => {
    expect((await askGmail('https://x/exec', 'k', undefined, reply({ ok: false }))).ok).toBe(false)
    const signIn = vi.fn(async () => new Response('<html>Sign in</html>')) as unknown as typeof fetch
    expect((await askGmail('https://x/exec', 'k', undefined, signIn)).ok).toBe(false)
    const dead = vi.fn(async () => {
      throw new Error('nope')
    }) as unknown as typeof fetch
    expect((await askGmail('https://x/exec', 'k', undefined, dead)).ok).toBe(false)
  })
})

it('sentOn says the day', () => {
  expect(sentOn('2026-10-30T14:00:00.000Z')).toBe('Oct 30')
})

// The script itself, run with Google's services faked: the key is what stands
// between anyone on the internet and the guide's inbox.
describe('the Gmail script’s doPost', () => {
  const source = readFileSync(join(process.cwd(), 'scripts', 'newsletter-apps-script.js'), 'utf8').replace(/^var KEY = ''$/m, "var KEY = 'nl_right'")
  const message = (from: string, subject: string) => ({
    getFrom: () => from,
    getHeader: () => '',
    getId: () => subject,
    getSubject: () => subject,
    getDate: () => new Date('2026-10-30T14:00:00Z'),
    getPlainBody: () => 'text',
    getAttachments: () => [],
  })
  function post(body: unknown, threads: { messages: ReturnType<typeof message>[]; at: number }[] = []) {
    const search = vi.fn(() => threads.map((t, i) => ({ getId: () => String(i), getMessages: () => t.messages, getLastMessageDate: () => new Date(t.at) })))
    const ctx: Record<string, unknown> = {
      GmailApp: { search },
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
      Session: { getEffectiveUser: () => ({ getEmail: () => 'guide@gmail.com' }) },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ setMimeType: () => t }) },
      console,
    }
    runInNewContext(source, ctx)
    const out = (ctx.doPost as (e: unknown) => string)({ postData: { contents: JSON.stringify(body) } })
    return { answer: JSON.parse(out), search }
  }

  it('the wrong key gets nothing, and Gmail isn’t searched', () => {
    const { answer, search } = post({ key: 'nl_wrong', address: 'a@b.org' })
    expect(answer).toEqual({ ok: false })
    expect(search).not.toHaveBeenCalled()
  })

  it('the right key with no address: it’s here', () => {
    expect(post({ key: 'nl_right' }).answer).toEqual({ ok: true, account: 'guide@gmail.com' })
  })

  it('its newest email from that address, not a reply from someone else', () => {
    const { answer } = post({ key: 'nl_right', address: 'Office@Ohev.org' }, [
      { at: 1, messages: [message('Office <office@ohev.org>', 'older')] },
      { at: 2, messages: [message('office@ohev.org', 'newest'), message('Someone <x@y.org>', 'a reply')] },
    ])
    expect(answer.email.subject).toBe('newest')
  })

  it('none in its 14 days', () => {
    expect(post({ key: 'nl_right', address: 'a@b.org' }).answer).toEqual({ ok: true, account: 'guide@gmail.com', email: null })
  })
})
