import { describe, expect, it, vi } from 'vitest'
import { fetchPublic, findMenu, findMenus, htmlToText, isOrderingApp, isPrivateAddress, MAX_MENU_PAGES, MAX_MENU_PICTURES, menuLinks, menuMessages, menuPictures, readMenu, readMenuPage, readMenus, tidyMenuReading, troubleClause, unreadMenuNote, type MenuSource, type Trouble } from './menuReader'

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

  // Oct 21: all of 192.0.x.x was refused, and WordPress.com's sites are
  // 192.0.78.x (Elkins Park's eruv, yiep.org). Only 192.0.0.0/24 and the
  // documentation range 192.0.2.0/24 are set aside.
  it('a site WordPress.com hosts is the public internet', () => {
    for (const ip of ['192.0.78.24', '192.0.78.25', '192.0.1.1']) expect(isPrivateAddress(ip), ip).toBe(false)
    for (const ip of ['192.0.0.8', '192.0.2.1']) expect(isPrivateAddress(ip), ip).toBe(true)
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

  // Oct 21: Moishe Zvi's watch read the guide's own listing page for it.
  it('the guide’s own pages aren’t read, a redirect to one included', async () => {
    const fetchImpl = vi.fn()
    const troubles: Trouble[] = []
    expect(await fetchPublic('https://phillyjewishguide.com/philly/mikvah', { fetchImpl, resolve: publicDns, trouble: (t) => troubles.push(t) })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
    fetchImpl.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://www.phillyjewishguide.com/philly' } }))
    expect(await fetchPublic('https://moishezvi.example', { fetchImpl, resolve: publicDns, trouble: (t) => troubles.push(t) })).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(troubles).toEqual([{ why: 'guide_page' }, { why: 'guide_page' }])
    expect(troubleClause(troubles[0])).toBe('it’s a page of this guide, not the place’s own')
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

  // Kol Tzedek's Google Calendar feed was 4.8 MB on Oct 21: every event it
  // ever had. A calendar feed may be that big; a page may not.
  it('a calendar feed may be bigger than a page, when the caller says so', async () => {
    const big = () => vi.fn().mockResolvedValue(page('BEGIN:VCALENDAR' + ' '.repeat(4_800_000), 'text/calendar'))
    expect(await fetchPublic('https://calendar.google.com/x.ics', { fetchImpl: big(), resolve: publicDns })).toBeNull()
    expect(await fetchPublic('https://calendar.google.com/x.ics', { fetchImpl: big(), resolve: publicDns, maxBytes: 20_000_000 })).toMatchObject({ type: 'html' })
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

// The user, Oct 21: "if I add something manually from a menu … will
// future reads look for that and tell me if it's successfully finding it?"
// Each read is given the listing's dishes, hand-added ones too, and either
// points to the menu's words for each or says it isn't there.
describe('the listing’s own dishes, looked for on every read', () => {
  const source: MenuSource = { url: 'https://grill.example/menu', text: 'MAINS\nChicken or beef SHAWARMA plate\nFalafel in pita\nClassic Burger\nFountain drinks', pdf: null }
  const listed = ['Falafel', 'Hamburgers', 'Hummus plate']

  it('tells the AI the dishes the listing has, and asks where the menu names each', () => {
    const [system, user] = menuMessages(source, 'Judah', listed) as { content: unknown }[]
    expect(system.content).toMatch(/put each one the menu names in "listed"/)
    expect(system.content).toContain('"listed": [{"name": "...", "quote": "..."}]')
    expect(JSON.stringify(user.content)).toContain('Its listing has these dishes already: Falafel, Hamburgers, Hummus plate.')
    expect(JSON.stringify((menuMessages(source, 'Judah') as { content: unknown }[])[1].content)).not.toContain('already')
  })

  it('one the menu names is kept as the listing spells it, marked; one it doesn’t is missing', () => {
    const r = tidyMenuReading(
      {
        dishes: [{ name: 'Shawarma', quote: 'Chicken or beef SHAWARMA plate' }, { name: 'Burger', quote: 'Classic Burger' }],
        listed: [
          { name: 'Falafel', quote: 'Falafel in pita' },
          { name: 'Hamburgers', quote: 'Classic Burger' },
          // Words that aren't on the page don't count as finding it.
          { name: 'Hummus plate', quote: 'Hummus plate' },
        ],
      },
      source,
      listed,
    )
    expect(r.dishes).toEqual([
      { name: 'Shawarma', quote: 'Chicken or beef SHAWARMA plate', checked: true, named: true },
      { name: 'Hamburgers', quote: 'Classic Burger', checked: true, named: true, onListing: true },
      { name: 'Falafel', quote: 'Falafel in pita', checked: true, named: true, onListing: true },
    ])
    expect(r.missing).toEqual(['Hummus plate'])
  })

  it('the listing’s own come on top of the ten', () => {
    const ten = Array.from({ length: 12 }, (_, i) => ({ name: `Dish ${String.fromCharCode(65 + i)}`, quote: 'Fountain drinks' }))
    const r = tidyMenuReading({ dishes: ten, listed: [{ name: 'Falafel', quote: 'Falafel in pita' }] }, source, ['Falafel'])
    expect(r.dishes).toHaveLength(11)
    expect(r.dishes.at(-1)).toMatchObject({ name: 'Falafel', onListing: true })
    expect(r.missing).toEqual([])
  })

  it('never says a dish is missing from a menu it only saw part of, or didn’t read', () => {
    const photos: MenuSource = { url: null, text: null, pdf: null, images: [{ mime: 'image/jpeg', b64: 'AAA' }] }
    expect(tidyMenuReading({ dishes: [{ name: 'Dosas', quote: 'Masala Dosa' }] }, photos, listed).missing).toEqual([])
    // A page that named no dishes isn't a menu without them.
    expect(tidyMenuReading({ dishes: [], note: 'A cookie notice.' }, source, listed).missing).toEqual([])
    // A PDF is a whole menu.
    const pdf: MenuSource = { url: 'https://g.example/m.pdf', text: null, pdf: 'JVBERg==' }
    expect(tidyMenuReading({ dishes: [{ name: 'Pizza', quote: 'Margherita Pizza' }] }, pdf, listed).missing).toEqual(listed)
  })

  it('a menu read from its pictures, after its words named nothing, says nothing is missing', async () => {
    const answers = [{ dishes: [], note: 'Just a welcome page.' }, { dishes: [{ name: 'Falafel', quote: 'Falafel' }] }]
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('openai')) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answers.shift()) } }] }), { status: 200 })
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    })
    const r = await readMenu({ ...source, pictures: ['https://grill.example/menu.jpg'] }, 'Judah', { apiKey: 'k', model: 'm', fetchImpl, resolve: publicDns, listed })
    expect(r.fromPictures).toBe(true)
    expect(r.missing).toEqual([])
    const sent = fetchImpl.mock.calls.filter(([u]) => String(u).includes('openai')).map(([, init]) => init!.body as string)
    expect(sent).toHaveLength(2)
    expect(sent.every((b) => b.includes('Its listing has these dishes already: Falafel, Hamburgers, Hummus plate.'))).toBe(true)
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

  it('a Square store on a place’s own domain is an ordering app too, by its order page', () => {
    expect(isOrderingApp('https://deli.luhvfood.com/s/order?location=4R67MWX3GRYC0')).toBe(true)
    expect(isOrderingApp('https://deli.luhvfood.com/s/order')).toBe(true)
    expect(isOrderingApp('https://deli.luhvfood.com/S/Order/')).toBe(true)
    expect(isOrderingApp('https://www.luhvfood.com/our-food')).toBe(false)
    expect(isOrderingApp('https://example.com/menus/order-ahead')).toBe(false)
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

// Oct 20: of the places whose menu couldn't be read, four sites refused the
// reader's old "compatible; … menu reader" name, several call their menu
// something else ("Our Food", "Catering", a store), and some link a wrong
// page first ("Thanksgiving menu coming soon").
describe('a menu on another page, or by another name', () => {
  const answer = (dishes: { name: string; quote: string }[], note?: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ dishes, note }) } }] }), { status: 200 })
  const words = (what: string) => `<p>${`${what} `.repeat(40)}</p>`

  it('asks as the website watch does, with the guide’s name in it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page('<p>hi</p>'))
    await fetchPublic('https://judah.example', { fetchImpl, resolve: publicDns })
    const headers = fetchImpl.mock.calls[0][1].headers as Record<string, string>
    expect(headers['user-agent']).toContain('PhillyJewishGuide')
    expect(JSON.stringify(headers)).not.toContain('compatible;')
    expect(headers.accept).toContain('application/pdf')
  })

  it('a link that calls the menu something else counts, after the ones that say menu; its own store does too, never an ordering app', () => {
    const html = `
      <a href="/about">About us</a>
      <a href="/our-food">Our Food</a>
      <a href="/catering">Catering</a>
      <a href="/sweet-shop">Sweet Shop</a>
      <a href="https://store.bakery.example/">Online Ordering</a>
      <a href="https://www.toasttab.com/bakery">Order online</a>
      <a href="/cart">Shop</a>
      <a href="/menu">Menu</a>`
    expect(menuLinks(html, 'https://www.bakery.example/')).toEqual([
      'https://www.bakery.example/menu',
      'https://www.bakery.example/our-food',
      'https://www.bakery.example/catering',
      'https://www.bakery.example/sweet-shop',
      'https://store.bakery.example/',
    ])
  })

  it(`up to ${MAX_MENU_PAGES} pages, best first, the website itself last`, async () => {
    const home = `<a href="/menu">Menu</a><a href="/catering">Catering</a><a href="/our-food">Our Food</a><a href="/shop">Shop</a>${words('Welcome to the bakery.')}`
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page(home))
      .mockResolvedValueOnce(page(words('Holiday menu coming soon.')))
      .mockResolvedValueOnce(page('<div id="root"></div>'))
      .mockResolvedValueOnce(page(words('Rugelach and challah.')))
      .mockResolvedValueOnce(page(words('Cakes.')))
    const found = await findMenus('https://diane.example', { fetchImpl, resolve: publicDns })
    expect(found.map((s) => s.url)).toEqual(['https://diane.example/menu', 'https://diane.example/our-food', 'https://diane.example/shop'])
    const room = vi
      .fn()
      .mockResolvedValueOnce(page(`<a href="/menu">Menu</a>${words('Welcome to the bakery.')}`))
      .mockResolvedValueOnce(page(words('Holiday menu coming soon.')))
    expect((await findMenus('https://diane.example', { fetchImpl: room, resolve: publicDns })).map((s) => s.url)).toEqual(['https://diane.example/menu', 'https://diane.example/'])
    expect(await findMenus('https://diane.example', { fetchImpl: vi.fn().mockResolvedValue(new Response('no', { status: 403 })), resolve: publicDns })).toEqual([])
  })

  it('reads the next page when one names no dishes; none do: the first one’s reason', async () => {
    const sources: MenuSource[] = [
      { url: 'https://diane.example/menu', text: 'Holiday menu coming soon.', pdf: null },
      { url: 'https://diane.example/', text: 'Rugelach, challah, kugel.', pdf: null },
    ]
    const fetchImpl = vi.fn().mockResolvedValueOnce(answer([], 'Coming soon.')).mockResolvedValueOnce(answer([{ name: 'Rugelach', quote: 'Rugelach' }]))
    const r = await readMenus(sources, 'Diane’s', { apiKey: 'k', fetchImpl, resolve: publicDns })
    expect(r).toMatchObject({ sourceUrl: 'https://diane.example/', dishes: [{ name: 'Rugelach' }] })
    const none = vi.fn().mockResolvedValueOnce(answer([], 'Coming soon.')).mockResolvedValueOnce(answer([], 'A home page.'))
    expect(await readMenus(sources, 'Diane’s', { apiKey: 'k', fetchImpl: none, resolve: publicDns })).toMatchObject({ sourceUrl: 'https://diane.example/menu', dishes: [], note: 'Coming soon.' })
    expect(await readMenus([], 'Diane’s', { apiKey: 'k', fetchImpl: vi.fn() })).toBeNull()
  })

  it('stops trying more pages once its time is up, so a request still answers', async () => {
    const sources: MenuSource[] = [1, 2, 3].map((n) => ({ url: `https://slow.example/${n}`, text: 'About us.', pdf: null }))
    let t = 0
    const fetchImpl = vi.fn().mockImplementation(async () => {
      t += 20_000
      return answer([], 'No menu.')
    })
    const r = await readMenus(sources, 'Slow', { apiKey: 'k', fetchImpl, resolve: publicDns, budgetMs: 30_000, now: () => t })
    expect(r).toMatchObject({ sourceUrl: 'https://slow.example/1', dishes: [] })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

// Oct 20: a page drawn by a script (Insomnia, Center City Pretzel, Mike's
// Chicken) has almost nothing on it until a browser runs it. When the
// caller can draw one (renderPage.ts), it's drawn; never otherwise.
describe('a page drawn by a script', () => {
  const empty = '<div id="root"></div><script src="/app.js"></script>'
  const menuWords = `<h2>Mains</h2>${'<p>Chicken Shawarma Plate with rice and salad</p>'.repeat(8)}`
  const drawn = (url: string, body: string) => ({ url, body })

  it('an empty home page is drawn, and the links it then has are followed; a menu page with nothing on it is drawn too', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(page(empty)).mockResolvedValueOnce(page(empty))
    const render = vi
      .fn()
      .mockResolvedValueOnce(drawn('https://cookies.example/', `<a href="/menu">Menu</a><p>Warm cookies, delivered late.</p>`))
      .mockResolvedValueOnce(drawn('https://cookies.example/menu', menuWords))
    const found = await findMenus('https://cookies.example', { fetchImpl, resolve: publicDns, render })
    expect(render.mock.calls.map(([u]) => u)).toEqual(['https://cookies.example/', 'https://cookies.example/menu'])
    expect(found).toEqual([expect.objectContaining({ url: 'https://cookies.example/menu', text: expect.stringContaining('Chicken Shawarma Plate') })])
  })

  it('nothing is drawn without a way to draw it, nor a page that has its words already', async () => {
    expect(await findMenus('https://cookies.example', { fetchImpl: vi.fn().mockResolvedValue(page(empty)), resolve: publicDns })).toEqual([])
    const render = vi.fn()
    await findMenus('https://grill.example', { fetchImpl: vi.fn().mockResolvedValue(page(menuWords)), resolve: publicDns, render })
    expect(render).not.toHaveBeenCalled()
  })

  it('at most three pages drawn for a website', async () => {
    const links = `<a href="/menu">Menu</a><a href="/catering">Catering</a><a href="/our-food">Our Food</a><a href="/shop">Shop</a>`
    const render = vi.fn(async (url: string) => drawn(url, url.endsWith('.example/') ? links : empty))
    await findMenus('https://cookies.example', { fetchImpl: vi.fn().mockImplementation(async () => page(empty)), resolve: publicDns, render })
    expect(render).toHaveBeenCalledTimes(3)
  })

  it('a menu link with nothing on it is drawn; a site that refuses the reader is never drawn', async () => {
    const render = vi.fn().mockResolvedValue(drawn('https://mikes.example/menu', menuWords))
    expect(await readMenuPage('https://mikes.example/menu', { fetchImpl: vi.fn().mockResolvedValue(page(empty)), resolve: publicDns, render })).toMatchObject({ url: 'https://mikes.example/menu', text: expect.stringContaining('Shawarma') })
    const refused = vi.fn()
    expect(await readMenuPage('https://pizza.example/', { fetchImpl: vi.fn().mockResolvedValue(new Response('no', { status: 403 })), resolve: publicDns, render: refused })).toBeNull()
    expect(await findMenus('https://pizza.example/', { fetchImpl: vi.fn().mockResolvedValue(new Response('no', { status: 403 })), resolve: publicDns, render: refused })).toEqual([])
    expect(refused).not.toHaveBeenCalled()
  })
})

// Oct 21: Ben & Jerry's, Center City Pretzel, Insomnia and Diane's read on a
// laptop and not on the site, and "Couldn't read a menu on its website"
// couldn't say why. The reader now says what it was told, page by page.
describe('why a page couldn’t be read', () => {
  const told = () => {
    const heard: Trouble[] = []
    return { heard, trouble: (t: Trouble) => void heard.push(t) }
  }
  const empty = '<div id="root"></div><script src="/app.js"></script>'

  it('turned away, missing, broken, silent, not public, or not a page', async () => {
    const cases: [() => Promise<Response>, Trouble][] = [
      [async () => new Response('no', { status: 403 }), { why: 'refused', status: 403 }],
      [async () => new Response('no', { status: 429 }), { why: 'refused', status: 429 }],
      [async () => new Response('no', { status: 404 }), { why: 'error', status: 404 }],
      [async () => new Response('no', { status: 500 }), { why: 'error', status: 500 }],
      [async () => { throw Object.assign(new Error('slow'), { name: 'TimeoutError' }) }, { why: 'unreachable', timedOut: true }],
      [async () => { throw new TypeError('fetch failed') }, { why: 'unreachable', timedOut: false }],
      [async () => page('x', 'application/zip'), { why: 'not_a_page' }],
    ]
    for (const [answer, want] of cases) {
      const { heard, trouble } = told()
      expect(await fetchPublic('https://site.example/', { fetchImpl: vi.fn(answer), resolve: publicDns, trouble })).toBeNull()
      expect(heard).toEqual([want])
    }
    const { heard, trouble } = told()
    expect(await fetchPublic('https://site.example/', { resolve: async () => ['10.0.0.1'], trouble })).toBeNull()
    expect(heard).toEqual([{ why: 'not_public' }])
  })

  it('a page read is no trouble', async () => {
    const { heard, trouble } = told()
    expect(await fetchPublic('https://site.example/', { fetchImpl: vi.fn().mockResolvedValue(page('<p>hi</p>')), resolve: publicDns, trouble })).not.toBeNull()
    expect(heard).toEqual([])
  })

  it('an empty page with no way to draw it; drawn, still empty; or why the browser couldn’t draw it', async () => {
    const fetchImpl = () => vi.fn().mockImplementation(async () => page(empty))
    let t = told()
    expect(await findMenus('https://cookies.example', { fetchImpl: fetchImpl(), resolve: publicDns, trouble: t.trouble })).toEqual([])
    expect(t.heard).toEqual([{ why: 'empty' }])

    t = told()
    await findMenus('https://cookies.example', { fetchImpl: fetchImpl(), resolve: publicDns, trouble: t.trouble, render: async (url) => ({ url, body: empty }) })
    expect(t.heard).toEqual([{ why: 'drawn_empty' }])

    t = told()
    await findMenus('https://cookies.example', {
      fetchImpl: fetchImpl(),
      resolve: publicDns,
      trouble: t.trouble,
      render: async (_url, trouble) => {
        trouble?.({ why: 'refused', status: 403 })
        return null
      },
    })
    expect(t.heard).toEqual([{ why: 'refused', status: 403 }])

    t = told()
    expect(await readMenuPage('https://mikes.example/menu', { fetchImpl: fetchImpl(), resolve: publicDns, trouble: t.trouble, render: async (url) => ({ url, body: empty }) })).toBeNull()
    expect(t.heard).toEqual([{ why: 'drawn_empty' }])

    t = told()
    expect(await readMenuPage('https://mikes.example/menu', { fetchImpl: fetchImpl(), resolve: publicDns, trouble: t.trouble })).toBeNull()
    expect(t.heard).toEqual([{ why: 'empty' }])

    t = told()
    expect(await readMenuPage('https://order.toasttab.com/x', { trouble: t.trouble })).toBeNull()
    expect(t.heard).toEqual([{ why: 'ordering_app' }])
  })

  it('says each in words, and what was tried', () => {
    expect(troubleClause({ why: 'refused', status: 403 })).toBe('it turned the reader away (403)')
    expect(troubleClause({ why: 'error', status: 404 })).toBe('it says the page isn’t there (404)')
    expect(troubleClause({ why: 'error', status: 500 })).toBe('it answered with an error (500)')
    expect(troubleClause({ why: 'unreachable', timedOut: true })).toBe('it didn’t answer in time')
    expect(troubleClause({ why: 'draw_failed', detail: 'net::ERR_ABORTED' })).toBe('it’s drawn by a script, and the browser couldn’t draw it (net::ERR_ABORTED)')
    expect(unreadMenuNote(null, 'https://x.example', { site: { why: 'person_check' } })).toBe('Couldn’t read a menu on its website: it asked the reader to prove it’s a person, which it never does.')
    expect(unreadMenuNote(null, 'https://x.example', {})).toBe('Couldn’t read a menu on its website.')
    expect(unreadMenuNote('https://x.example/menu', null, { link: { why: 'empty' } })).toBe('Couldn’t read its menu link: it has almost no words on it and no menu pictures.')
    expect(unreadMenuNote(null, null, {})).toBe('No website or menu link to read.')
  })

  it('a chain’s own ordering site (order.…) is an ordering app; a word that merely starts with “order” isn’t', () => {
    expect(isOrderingApp('https://order.benjerry.com/menu/upenn?canRedirect=True')).toBe(true)
    expect(isOrderingApp('https://ordering.example.com/')).toBe(true)
    expect(isOrderingApp('https://orderly.example.com/')).toBe(false)
    expect(isOrderingApp('https://www.benjerry.com/scoop-shops/menu')).toBe(false)
  })
})
