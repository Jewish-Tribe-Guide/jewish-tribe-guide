import { describe, expect, it, vi } from 'vitest'
import { fetchPublic, findMenu, htmlToText, isOrderingApp, isPrivateAddress, MAX_MENU_PICTURES, menuLinks, menuMessages, menuPictures, readMenu, readMenuPage, tidyMenuReading, type MenuSource } from './menuReader'

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

  // Oct 17: a place's own menu link is read as it is, never searched from.
  it('a menu link: the page itself, or its PDF; never an ordering app, nor a page with nearly no text', async () => {
    const menuText = `<h2>Mains</h2>${'<p>Chicken Shawarma Plate with rice and salad</p>'.repeat(8)}`
    const one = vi.fn().mockResolvedValueOnce(page(menuText))
    expect(await readMenuPage('https://grill.example/menu', { fetchImpl: one, resolve: publicDns })).toMatchObject({ url: 'https://grill.example/menu', pdf: null })
    expect(one).toHaveBeenCalledTimes(1)
    const pdf = await readMenuPage('https://grill.example/menu.pdf', { fetchImpl: vi.fn().mockResolvedValue(page('%PDF-1.4', 'application/pdf')), resolve: publicDns })
    expect(pdf).toMatchObject({ text: null, pdf: expect.any(String) })
    const app = vi.fn()
    expect(await readMenuPage('https://www.doordash.com/store/grill', { fetchImpl: app, resolve: publicDns })).toBeNull()
    expect(app).not.toHaveBeenCalled()
    expect(await readMenuPage('https://grill.example/menu', { fetchImpl: vi.fn().mockResolvedValue(page('<div id="root"></div>')), resolve: publicDns })).toBeNull()
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

  // The user's note 16 (Oct 10): menus read badly. Tried on twelve real
  // places' menus and two sets of screenshots: one food came back as three
  // dishes ("Falafel Pita", "Falafel Bowl", "Falafel Salad"), and a few
  // photos of one section of a menu were padded out with its vegetable
  // sides. The instructions now say both.
  it('tells the model one dish per kind of food, and never to pad a part of a menu with sides', () => {
    const [system] = menuMessages(source, 'Judah') as { content: string }[]
    expect(system.content).toMatch(/one dish per kind of food/i)
    expect(system.content).toContain('"Falafel Pita", "Falafel Bowl" and "Falafel Salad" are one dish, Falafel')
    expect(system.content).toMatch(/only part of a menu/i)
    expect(system.content).toMatch(/never fill the list with vegetables, rice, noodles or other sides/i)
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

// Oct 6: a menu can come from the "+ Add" box, as photos or as a link. A
// delivery app's is never fetched (agreed: its terms forbid it, and it
// blocks readers), and a photo has no words to check the dishes against.
describe('a menu from the "+ Add" box', () => {
  it('knows a delivery or ordering app’s link, and nothing else', () => {
    expect(isOrderingApp('https://www.doordash.com/store/say-she-ate-123')).toBe(true)
    expect(isOrderingApp('https://order.toasttab.com/online/x')).toBe(true)
    expect(isOrderingApp('https://saysheate.co/menu/')).toBe(false)
    expect(isOrderingApp('https://notdoordash.com/')).toBe(false)
    expect(isOrderingApp('not a link')).toBe(false)
  })

  it('sends photos of a menu as images, saying there’s no page, and keeps the dishes unchecked', () => {
    const source: MenuSource = { url: null, text: null, pdf: null, images: [{ mime: 'image/jpeg', b64: 'AAA' }] }
    const user = menuMessages(source, 'Say She Ate')[1] as { content: unknown[] }
    expect(user.content).toEqual([
      { type: 'text', text: 'The place: Say She Ate. Its menu, in the photos:' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } },
    ])
    expect(tidyMenuReading({ dishes: [{ name: 'Dosas', quote: 'Masala Dosa' }] }, source)).toEqual({
      sourceUrl: null,
      dishes: [{ name: 'Dosas', quote: 'Masala Dosa', checked: false, named: true }],
      note: null,
    })
  })
})

// Oct 20 (the user): a menu posted as pictures on the place's own site.
// Of 27 places whose reading had failed on dev, three had their menu as
// pictures (A La Karte's brochure, Star of David Grill's menu page, Mordy's
// ballpark menu); none of them could be read before.
describe('a menu posted as pictures', () => {
  const jpeg = (body = 'JPEGDATA') => new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg' } })
  const answer = (dishes: { name: string; quote: string }[], note?: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ dishes, note }) } }] }), { status: 200 })
  const words = `<p>${'Welcome to our restaurant, family owned since 1990. '.repeat(6)}</p>`

  it('on a home page, only pictures that say they’re the menu; on its menu page, its pictures; never a logo, an icon, an SVG or a GIF', () => {
    const html = `
      <img src="/img/logo.png" alt="Grill">
      <img src="/img/food1.jpg" alt="Our shawarma">
      <img src="/img/icon-menu.svg" alt="menu">
      <img src="/img/spinner.gif">
      <img data-src="/files/Catering_Menu_Brochure_1.jpg" src="data:image/gif;base64,R0lGOD">
      <img src="/cdn/shop/files/Flyer_{width}x.png" alt="Shabbat menu">
      <img src="/img/page2.jpg" alt="Shabbat menu, page 2">`
    expect(menuPictures(html, 'https://grill.example/', { menuPage: false })).toEqual(['https://grill.example/files/Catering_Menu_Brochure_1.jpg', 'https://grill.example/img/page2.jpg'])
    expect(menuPictures(html, 'https://grill.example/menu', { menuPage: true })).toEqual([
      'https://grill.example/files/Catering_Menu_Brochure_1.jpg',
      'https://grill.example/img/page2.jpg',
      'https://grill.example/img/food1.jpg',
    ])
  })

  it('the largest of a srcset; a Next.js image is its own picture, not one per site; a link straight to a picture; at most four', () => {
    const next = (file: string, w: number) => `/_next/image?url=https%3A%2F%2Fcdn.example%2F${file}&amp;w=${w}&amp;q=75`
    const html = `
      <img alt="Ballpark" srcSet="${next('header.jpg', 640)} 640w, ${next('header.jpg', 3840)} 3840w">
      <img alt="Citizens Bank Park menu." srcSet="${next('citizens-menu.jpg', 640)} 640w, ${next('citizens-menu.jpg', 3840)} 3840w">
      <a href="/uploads/dinner.jpg">See our dinner menu</a>`
    expect(menuPictures(html, 'https://mordys.example/park', { menuPage: false })).toEqual([
      'https://mordys.example/_next/image?url=https%3A%2F%2Fcdn.example%2Fcitizens-menu.jpg&w=3840&q=75',
      'https://mordys.example/uploads/dinner.jpg',
    ])
    const many = Array.from({ length: 9 }, (_, i) => `<img src="/menu-${i}.jpg">`).join('')
    expect(menuPictures(many, 'https://grill.example/menu', { menuPage: true })).toHaveLength(MAX_MENU_PICTURES)
  })

  it('a picture is fetched only when asked for, as safely as a page', async () => {
    expect(await fetchPublic('https://g.example/menu.jpg', { fetchImpl: vi.fn().mockResolvedValue(jpeg()), resolve: publicDns })).toBeNull()
    expect(await fetchPublic('https://g.example/menu.jpg', { fetchImpl: vi.fn().mockResolvedValue(jpeg()), resolve: publicDns, pictures: true })).toEqual({
      url: 'https://g.example/menu.jpg',
      type: 'picture',
      mime: 'image/jpeg',
      body: Buffer.from('JPEGDATA').toString('base64'),
    })
    const metadata = vi.fn()
    expect(await fetchPublic('https://g.example/menu.jpg', { fetchImpl: metadata, resolve: async () => ['169.254.169.254'], pictures: true })).toBeNull()
    expect(metadata).not.toHaveBeenCalled()
  })

  it('a menu page that is only pictures is its menu; so is a menu link that is a picture', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page(`<a href="/menu.html">Menu</a>${words}`))
      .mockResolvedValueOnce(page('<img src="/images/menu1.jpg"><img src="/images/menu2.jpg">'))
    expect(await findMenu('http://star.example/', { fetchImpl, resolve: publicDns })).toEqual({
      url: 'http://star.example/menu.html',
      text: null,
      pdf: null,
      pictures: ['http://star.example/images/menu1.jpg', 'http://star.example/images/menu2.jpg'],
    })
    const none = vi.fn()
    expect(await readMenuPage('https://grill.example/uploads/Menu.JPG', { fetchImpl: none, resolve: publicDns })).toEqual({
      url: 'https://grill.example/uploads/Menu.JPG',
      text: null,
      pdf: null,
      pictures: ['https://grill.example/uploads/Menu.JPG'],
    })
    expect(none).not.toHaveBeenCalled()
    expect(await readMenuPage('https://grill.example/menu', { fetchImpl: vi.fn().mockResolvedValue(page('<img src="/m.png">')), resolve: publicDns })).toMatchObject({ text: null, pictures: ['https://grill.example/m.png'] })
  })

  it('its words first; when they name no dishes, its pictures, read as photos, the dishes marked as from a picture', async () => {
    const source: MenuSource = { url: 'https://karte.example/catering', text: 'Catering for every simcha. Ask about our brochure.', pdf: null, pictures: ['https://karte.example/brochure1.jpg', 'https://karte.example/brochure2.jpg'] }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(answer([], 'This page names no dishes.'))
      .mockResolvedValueOnce(jpeg('ONE'))
      .mockResolvedValueOnce(jpeg('TWO'))
      .mockResolvedValueOnce(answer([{ name: 'Brisket', quote: 'Slow Roasted Brisket' }]))
    const r = await readMenu(source, 'A La Karte', { apiKey: 'k', model: 'm', fetchImpl, resolve: publicDns })
    expect(r).toEqual({
      sourceUrl: 'https://karte.example/catering',
      dishes: [{ name: 'Brisket', quote: 'Slow Roasted Brisket', checked: false, named: true, picture: true }],
      note: null,
      model: 'm',
      fromPictures: true,
    })
    const second = JSON.parse(fetchImpl.mock.calls[3][1].body).messages[1].content
    expect(second.map((c: { type: string }) => c.type)).toEqual(['text', 'image_url', 'image_url'])
    expect(second[1].image_url.url).toBe(`data:image/jpeg;base64,${Buffer.from('ONE').toString('base64')}`)
  })

  it('words that name dishes are enough: the pictures aren’t fetched', async () => {
    const source: MenuSource = { url: 'https://grill.example/menu', text: 'MAINS\nFalafel in pita', pdf: null, pictures: ['https://grill.example/menu.jpg'] }
    const fetchImpl = vi.fn().mockResolvedValueOnce(answer([{ name: 'Falafel', quote: 'Falafel in pita' }]))
    const r = await readMenu(source, 'Judah', { apiKey: 'k', fetchImpl, resolve: publicDns })
    expect(r.dishes.map((d) => d.name)).toEqual(['Falafel'])
    expect(r.fromPictures).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('a page with no words to speak of goes straight to its pictures; pictures that won’t open, or name nothing, leave the words’ reason', async () => {
    const onlyPictures: MenuSource = { url: 'http://star.example/menu.html', text: null, pdf: null, pictures: ['http://star.example/m1.jpg'] }
    const straight = vi.fn().mockResolvedValueOnce(jpeg()).mockResolvedValueOnce(answer([{ name: 'Shawarma', quote: 'Shawarma Plate' }]))
    expect((await readMenu(onlyPictures, 'Star of David', { apiKey: 'k', fetchImpl: straight, resolve: publicDns })).dishes.map((d) => d.name)).toEqual(['Shawarma'])
    expect(straight).toHaveBeenCalledTimes(2)

    const broken = vi.fn().mockResolvedValueOnce(new Response('gone', { status: 404 }))
    expect(await readMenu(onlyPictures, 'Star of David', { apiKey: 'k', model: 'm', fetchImpl: broken, resolve: publicDns })).toEqual({
      sourceUrl: 'http://star.example/menu.html',
      dishes: [],
      note: 'Its menu’s pictures couldn’t be opened.',
      model: 'm',
    })

    const withWords: MenuSource = { ...onlyPictures, text: 'About us: a family grill.' }
    const nothing = vi.fn().mockResolvedValueOnce(answer([], 'An about page.')).mockResolvedValueOnce(jpeg()).mockResolvedValueOnce(answer([], 'A photo of the dining room.'))
    expect((await readMenu(withWords, 'Star of David', { apiKey: 'k', fetchImpl: nothing, resolve: publicDns })).note).toBe('An about page.')
  })
})
