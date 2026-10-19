import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

// The Gmail script (newsletter-apps-script.js) runs in Google's Apps Script,
// not here, so it's run in a sandbox with Gmail and the site stood in for.
//
// It used to send every inbox email to the site, which added every stranger
// to the Watches tab (the user, Oct 18: "every email seems excessive"). Now
// it asks the site whose emails to send, searches for just those, and
// nothing else leaves the inbox.

const SOURCE = readFileSync(join(__dirname, 'newsletter-apps-script.js'), 'utf8')

/** `list`: the mailing list it came through, as its List-Post header says. */
type Message = { id: string; from: string; list?: string }
type Thread = { id: string; last: number; messages: Message[] }

function run({ senders, inbox = [], sendersStatus = 200 }: { senders: string[]; inbox?: Thread[]; sendersStatus?: number }) {
  const searches: string[] = []
  const posted: string[] = []
  const payloads: Record<string, unknown>[] = []
  const asked: string[] = []
  const props = new Map<string, string>([['NEWSLETTER_SECRET', 's3cret']])
  const response = (code: number, body: unknown) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) })
  const message = (m: Message) => ({
    getId: () => m.id,
    getFrom: () => m.from,
    getHeader: (name: string) => (name === 'List-Post' && m.list ? `<mailto:${m.list}>` : ''),
    getSubject: () => 'Shabbos',
    getDate: () => new Date('2026-10-16T14:00:00Z'),
    getPlainBody: () => 'Mincha 6pm',
    getAttachments: () => [],
  })
  const context = {
    console: { log: () => {} },
    JSON,
    Date,
    Math,
    Object,
    Array,
    Error,
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, v) }),
    },
    UrlFetchApp: {
      fetch: (url: string, opts: { method?: string; payload?: string; headers?: Record<string, string> }) => {
        if ((opts.method ?? 'get') === 'get') {
          asked.push(`${url} ${opts.headers?.Authorization}`)
          return response(sendersStatus, sendersStatus === 200 ? { ok: true, senders } : { ok: false, error: 'nope' })
        }
        payloads.push(JSON.parse(opts.payload!))
        posted.push(JSON.parse(opts.payload!).messageId)
        return response(200, { ok: true, status: 'read', filed: 0 })
      },
    },
    GmailApp: {
      // Gmail's own matching, roughly: a thread with a message from one of
      // the addresses in the query's from:(…), or sent through one of the
      // lists in its list:(…).
      search: (query: string) => {
        searches.push(query)
        const from = query.match(/from:\(([^)]*)\)/)?.[1].split(' OR ') ?? null
        const list = query.match(/list:\(([^)]*)\)/)?.[1].split(' OR ') ?? null
        const matches = (m: Message) => (from ? from.some((w) => m.from.toLowerCase().includes(w)) : list ? list.some((w) => m.list?.toLowerCase() === w) : true)
        return inbox
          .filter((t) => t.messages.some(matches))
          .sort((a, b) => b.last - a.last)
          .map((t) => ({ getId: () => t.id, getLastMessageDate: () => new Date(t.last), getMessages: () => t.messages.map(message) }))
      },
    },
    Utilities: { base64Encode: () => '' },
    ScriptApp: {},
  }
  runInNewContext(`${SOURCE}\nreadNewsletters()`, context)
  return { searches, posted, asked, payloads }
}

describe('the Gmail script', () => {
  it('asks the site, with the secret, whose emails to send', () => {
    const { asked } = run({ senders: ['info@mekor.org'] })
    expect(asked).toEqual(['https://phillyjewishguide.com/api/inbound/newsletter?community=philly Bearer s3cret'])
  })

  it('sends only the watched senders’ emails, oldest first', () => {
    const { searches, posted } = run({
      senders: ['info@mekor.org', 'office@yi.org'],
      inbox: [
        { id: 't1', last: 3, messages: [{ id: 'yi', from: 'Young Israel <Office@YI.org>' }] },
        { id: 't2', last: 2, messages: [{ id: 'notice', from: 'notifications@phillyjewishguide.com' }] },
        { id: 't3', last: 1, messages: [{ id: 'mekor', from: '"Mekor" <info@mekor.org>' }] },
      ],
    })
    expect(searches).toEqual(['in:inbox newer_than:14d from:(info@mekor.org OR office@yi.org)', 'in:inbox newer_than:14d list:(info@mekor.org OR office@yi.org)'])
    expect(posted).toEqual(['mekor', 'yi'])
  })

  it('skips a reply in a watched thread from someone else', () => {
    const { posted } = run({
      senders: ['info@mekor.org'],
      inbox: [{ id: 't1', last: 1, messages: [{ id: 'mekor', from: 'info@mekor.org' }, { id: 'reply', from: 'Someone <someone@gmail.com>' }] }],
    })
    expect(posted).toEqual(['mekor'])
  })

  it('splits a long list of senders over several searches, and sends each thread once', () => {
    const senders = Array.from({ length: 45 }, (_, i) => `shul${i}@shul.org`)
    const { searches, posted } = run({
      senders,
      inbox: [{ id: 't1', last: 1, messages: [{ id: 'a', from: 'shul0@shul.org' }] }],
    })
    expect(searches.length).toBeGreaterThan(1)
    const searched = searches.flatMap((q) => q.match(/from:\(([^)]*)\)/)?.[1].split(' OR ') ?? [])
    expect(searched.sort()).toEqual([...senders].sort())
    expect(posted).toEqual(['a'])
  })

  // groups.io sends each email from whoever posted it (Northeast's eruv
  // list, Oct 19): the list's own address finds it, and goes with it.
  it('sends a mailing list’s emails, whoever posted them, with the list', () => {
    const { searches, posted, payloads } = run({
      senders: ['jcor-ne-philadelphia@groups.io'],
      inbox: [
        { id: 't1', last: 2, messages: [{ id: 'up', from: 'Moshe Levi via groups.io <mlevi=gmail.com@groups.io>', list: 'JCOR-NE-Philadelphia@groups.io' }] },
        { id: 't2', last: 1, messages: [{ id: 'other', from: 'Someone <x@groups.io>', list: 'other-list@groups.io' }] },
      ],
    })
    expect(searches).toContain('in:inbox newer_than:14d list:(jcor-ne-philadelphia@groups.io)')
    expect(posted).toEqual(['up'])
    expect(payloads[0]).toMatchObject({ from: 'Moshe Levi via groups.io <mlevi=gmail.com@groups.io>', list: 'jcor-ne-philadelphia@groups.io' })
  })

  it('searches nothing when no sender has been added yet', () => {
    const { searches, posted } = run({ senders: [], inbox: [{ id: 't1', last: 1, messages: [{ id: 'a', from: 'x@y.org' }] }] })
    expect(searches).toEqual([])
    expect(posted).toEqual([])
  })

  it('stops, sending nothing, when the site refuses to say', () => {
    expect(() => run({ senders: [], sendersStatus: 503 })).toThrow(/The site refused/)
  })
})
