import { describe, expect, it, vi } from 'vitest'
import { fetchPublic, findMenu, htmlToText, isPrivateAddress, menuLinks, menuMessages, readMenu, tidyMenuReading, type MenuSource } from './menuReader'

const publicDns = async () => ['93.184.216.34']
const page = (body: string, type = 'text/html; charset=utf-8', status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': type, ...headers } })

describe('only the public internet', () => {
  it('private, loopback, link-local and carrier ranges are refused', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false)
  })

  it('a site whose name resolves to a private address isn’t fetched', async () => {
    const fetchImpl = vi.fn()
    expect(await fetchPublic('http://menu.example', { fetchImpl, resolve: async () => ['127.0.0.1'] })).toBeNull()
    expect(await fetchPublic('http://localhost/menu', { fetchImpl, resolve: publicDns })).toBeNull()
    expect(await fetchPublic('file:///etc/passwd', { fetchImpl, resolve: publicDns })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('every redirect is checked: one to the cloud metadata address stops there', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/' } }))
    expect(await fetchPublic('https://grill.example', { fetchImpl, resolve: publicDns })).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('follows a public redirect, and reads a PDF as a file', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/menu.pdf' } }))
      .mockResolvedValueOnce(page('%PDF-1.7 menu', 'application/pdf'))
    const got = await fetchPublic('https://grill.example', { fetchImpl, resolve: publicDns })
    expect(got).toMatchObject({ url: 'https://grill.example/menu.pdf', type: 'pdf' })
    expect(Buffer.from(got!.body, 'base64').toString()).toBe('%PDF-1.7 menu')
  })

  it('nothing too big, and nothing that isn’t a page or a PDF', async () => {
    expect(await fetchPublic('https://g.example', { fetchImpl: vi.fn().mockResolvedValue(page('x', 'text/html', 200, { 'content-length': '9000000' })), resolve: publicDns })).toBeNull()
    expect(await fetchPublic('https://g.example', { fetchImpl: vi.fn().mockResolvedValue(page('x', 'image/png')), resolve: publicDns })).toBeNull()
  })
})

describe('reading a page', () => {
  it('its text, a line per block, without scripts or markup', () => {
    const html = `<html><head><title>x</title><style>.a{}</style></head><body><script>var menu = 1</script>
      <h2>BURGERS</h2><ul><li>Classic Burger &amp; Fries <b>$14</b></li><li>Beyond&nbsp;Burger</li></ul><!-- comment --></body></html>`
    expect(htmlToText(html)).toBe('BURGERS\nClassic Burger & Fries $14\nBeyond Burger')
  })

  it('finds the links that say they’re the menu, best first, on the same site or a PDF anywhere', () => {
    const html = `
      <a href="/about">About</a>
      <a href="/food-menu">See what we serve</a>
      <a href="https://grill.example/menu">Our Menu</a>
      <a href="https://files.example/x/dinner-menu.pdf">Dinner (PDF)</a>
      <a href="https://other.example/menu">Menu elsewhere</a>
      <a href="/order-online/menu">Order</a>
      <a href="mailto:a@b.c">Menu by email</a>`
    expect(menuLinks(html, 'https://www.grill.example/')).toEqual(['https://grill.example/menu', 'https://www.grill.example/food-menu', 'https://files.example/x/dinner-menu.pdf'])
  })

  it('the menu its website links to; the website itself when it links none', async () => {
    const menuText = `<h2>Mains</h2>${'<p>Chicken Shawarma Plate with rice and salad</p>'.repeat(8)}`
    const fetchImpl = vi.fn().mockResolvedValueOnce(page('<a href="/menu">Menu</a><p>Welcome</p>')).mockResolvedValueOnce(page(menuText))
    expect(await findMenu('https://grill.example', { fetchImpl, resolve: publicDns })).toMatchObject({ url: 'https://grill.example/menu', pdf: null })
    const onePage = vi.fn().mockResolvedValueOnce(page(menuText))
    expect(await findMenu('https://grill.example', { fetchImpl: onePage, resolve: publicDns })).toMatchObject({ url: 'https://grill.example/' })
    // A page with nearly no text (drawn by a script) isn't a menu.
    expect(await findMenu('https://grill.example', { fetchImpl: vi.fn().mockResolvedValue(page('<div id="root"></div>')), resolve: publicDns })).toBeNull()
  })
})

describe('what the AI said, kept to what holds up', () => {
  const source: MenuSource = { url: 'https://grill.example/menu', text: 'MAINS\nChicken or beef SHAWARMA plate\nFalafel in pita\nClassic Burger\nFountain drinks', pdf: null }

  it('a dish whose words aren’t on the page is dropped: the menu doesn’t say it', () => {
    const r = tidyMenuReading(
      {
        dishes: [
          { name: 'Shawarma', quote: 'chicken or beef shawarma   plate' },
          { name: 'Falafel', quote: 'Falafel in pita' },
          { name: 'Sushi', quote: 'Spicy tuna roll' },
          { name: 'Burger', quote: 'Classic Burger' },
          { name: 'Hamburgers', quote: 'Classic Burger' },
          { name: 'Steak' },
        ],
      },
      source,
    )
    expect(r.dishes).toEqual([
      { name: 'Shawarma', quote: 'chicken or beef shawarma plate', checked: true, named: true },
      { name: 'Falafel', quote: 'Falafel in pita', checked: true, named: true },
      { name: 'Burgers', quote: 'Classic Burger', checked: true, named: true },
    ])
    expect(r.note).toBeNull()
  })

  it('a line that doesn’t name the dish is kept, and marked for a second look', () => {
    expect(tidyMenuReading({ dishes: [{ name: 'Wraps', quote: 'Falafel in pita' }] }, source).dishes).toEqual([{ name: 'Wraps', quote: 'Falafel in pita', checked: true, named: false }])
  })

  it('a word only part of another isn’t a match', () => {
    expect(tidyMenuReading({ dishes: [{ name: 'Pita', quote: 'pit' }] }, source).dishes).toEqual([])
  })

  it('from a PDF, nothing to check against: kept, and said so', () => {
    const r = tidyMenuReading({ dishes: [{ name: 'Pizza', quote: 'Margherita Pizza' }] }, { url: 'https://g.example/m.pdf', text: null, pdf: 'JVBERg==' })
    expect(r.dishes).toEqual([{ name: 'Pizza', quote: 'Margherita Pizza', checked: false, named: true }])
  })

  it('ten at most; none says why', () => {
    const many = { dishes: Array.from({ length: 14 }, (_, i) => ({ name: `Dish ${String.fromCharCode(65 + i)}`, quote: 'Falafel in pita' })) }
    expect(tidyMenuReading(many, source).dishes).toHaveLength(10)
    expect(tidyMenuReading({ dishes: [], note: 'This is the catering page.' }, source).note).toBe('This is the catering page.')
    expect(tidyMenuReading('nonsense', source)).toEqual({ sourceUrl: source.url, dishes: [], note: 'No main dishes found on the menu.' })
  })

  it('sends a page as text and a PDF as a file', () => {
    const [, user] = menuMessages(source, 'Judah') as { content: unknown }[]
    expect(user.content).toContain('Chicken or beef SHAWARMA plate')
    const [, pdfUser] = menuMessages({ url: 'u', text: null, pdf: 'JVBERg==' }, 'Judah') as { content: { type: string }[] }[]
    expect(pdfUser.content.map((c) => c.type)).toEqual(['text', 'file'])
  })

  it('asks the model, and tidies its answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ dishes: [{ name: 'Falafel', quote: 'Falafel in pita' }, { name: 'Ramen', quote: 'Tonkotsu' }] }) } }] }), { status: 200 }),
    )
    const r = await readMenu(source, 'Judah', { apiKey: 'k', model: 'm', fetchImpl })
    expect(r.dishes.map((d) => d.name)).toEqual(['Falafel'])
    expect(r.model).toBe('m')
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe('m')
  })
})
