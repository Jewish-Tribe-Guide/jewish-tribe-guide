// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, within, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeCommunity } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { fetchJson, parseOkJson } from '@/lib/fetchJson'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import type { HomeSection } from '@/lib/homeSections'
import { writePreviewDraft } from '@/lib/previewDraft'
import SiteSettingsEditor, { countChanges } from './SiteSettingsEditor'

// SiteSettingsEditor loads its own draft over the network (settings +
// sections), so this mocks fetchJson/parseOkJson the way ModerationQueue's
// test does, and writePreviewDraft (a sessionStorage write the preview
// reads).

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/philly/admin/home',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/fetchJson', () => ({ fetchJson: vi.fn(), parseOkJson: vi.fn() }))
// The Today home is held back from the site (features.ts); its settings are
// tested with it switched on, and once with it off.
const features = vi.hoisted(() => ({ todayHome: true, whatChanged: true }))
vi.mock('@/lib/features', () => ({ features }))
vi.mock('@/lib/previewDraft', () => ({
  previewUrl: (community: string) => `/${community}?preview=1`,
  writePreviewDraft: vi.fn(),
}))

function fakeResponse(): Response {
  return { ok: true, status: 200 } as Response
}

function mockLoad(settings: typeof SITE_SETTINGS_DEFAULTS, sections: HomeSection[] = []) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse()))
  vi.mocked(parseOkJson).mockImplementation(() => {
    // Settings first, sections second, in the order load() awaits them; a
    // third call is the email sign-up card's list of who signed up.
    const call = vi.mocked(parseOkJson).mock.calls.length
    return Promise.resolve(call === 1 ? { settings } : call === 2 ? { sections } : { subscribers: [] })
  })
}

async function renderEditor(settings = SITE_SETTINGS_DEFAULTS, sections: HomeSection[] = []) {
  mockLoad(settings, sections)
  const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
  renderWithProviders(<SiteSettingsEditor token="tok" />, {
    content: { categories: [grocery] },
    community: makeCommunity({ slug: 'philly' }),
  })
  await screen.findByRole('complementary', { name: 'Preview' })
}

const saveBar = () => screen.queryByRole('region', { name: 'Save' })
const boxes = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
/** Computer or Phone, at the top. */
async function show(user: ReturnType<typeof userEvent.setup>, device: 'Computer' | 'Phone') {
  await user.click(within(screen.getByRole('group', { name: 'Show the page on' })).getByRole('button', { name: device }))
}
const sentBody = () => JSON.parse((vi.mocked(fetchJson).mock.calls[0]![1] as RequestInit).body as string)

async function saveWith(user: ReturnType<typeof userEvent.setup>, settings: typeof SITE_SETTINGS_DEFAULTS) {
  // The PATCH echoes back the saved settings, which the draft is re-derived
  // from.
  vi.mocked(fetchJson).mockResolvedValue({ settings })
  await user.click(within(saveBar()!).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(within(saveBar()!).getByText('Saved.')).toBeInTheDocument())
}

beforeEach(() => {
  vi.mocked(fetchJson).mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SiteSettingsEditor — Home page', () => {
  // The drawing 2sssenojcQzzeHtHAT8gnp: one screen for the home page and the
  // header over it, Computer or Phone at the top, each showing only what's
  // on that version, in the order the page reads.
  it('on a computer: the name and logo, the header, the top of the page, the search box, the cards', async () => {
    await renderEditor()
    expect(boxes()).toEqual(['Name and logo', 'Header', 'Top of the page', 'Search box', 'Cards under the search'])
    expect(within(screen.getByRole('group', { name: 'Show the page on' })).getByRole('button', { name: 'Computer' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('on a phone: the name and logo, the search box and the tabs', async () => {
    const user = userEvent.setup()
    features.todayHome = false
    try {
      await renderEditor()
      await show(user, 'Phone')
      expect(boxes()).toEqual(['Name and logo', 'Search box', 'Tabs'])
    } finally {
      features.todayHome = true
    }
  })

  it('says which boxes are on both, and only those', async () => {
    const user = userEvent.setup()
    await renderEditor()
    const tagged = () => screen.getAllByRole('region').filter((r) => /Also on a/.test(r.querySelector('h2')!.parentElement!.textContent!)).map((r) => r.getAttribute('aria-label'))
    expect(tagged()).toEqual(['Name and logo', 'Search box'])
    expect(screen.getAllByText('Also on a phone')).toHaveLength(2)
    await show(user, 'Phone')
    expect(tagged()).toEqual(['Name and logo', 'Search box'])
    expect(screen.getAllByText('Also on a computer')).toHaveLength(2)
  })

  // The user, Nov 4: what a shared link shows is the big line and the line
  // under it (shareDescription), so it has no box of its own; the Title
  // under it was shown nowhere a visitor could see.
  it('has no box for a shared link, and no Title or Description', async () => {
    const user = userEvent.setup()
    await renderEditor()
    for (const device of ['Computer', 'Phone'] as const) {
      await show(user, device)
      expect(screen.queryByText('When the link is shared')).toBeNull()
      expect(screen.queryByLabelText('Title')).toBeNull()
      expect(screen.queryByLabelText('Description')).toBeNull()
    }
  })

  // A half-typed change survives switching between the two.
  it('keeps what was typed when switching to Phone and back', async () => {
    const user = userEvent.setup()
    await renderEditor()
    await user.type(screen.getByLabelText('Big line'), '!')
    await show(user, 'Phone')
    await user.type(screen.getByLabelText('Words in the search box'), '?')
    await show(user, 'Computer')
    expect(screen.getByLabelText('Big line')).toHaveValue(`${SITE_SETTINGS_DEFAULTS.desktopHeroHeadline}!`)
    expect(within(saveBar()!).getByText('2 changes')).toBeInTheDocument()
  })

  it('names each field by what a visitor sees', async () => {
    await renderEditor({
      ...SITE_SETTINGS_DEFAULTS,
      desktopHeroHeadline: 'Your guide',
      desktopHeroSubhead: 'Kept current by you',
      searchPlaceholder: 'Ask: challah',
    })
    expect(screen.getByLabelText('Big line')).toHaveValue('Your guide')
    // Wraps, so a long line shows whole (the user, Nov 4).
    expect(screen.getByLabelText('Line under it')).toHaveValue('Kept current by you')
    expect(screen.getByLabelText('Line under it').tagName).toBe('TEXTAREA')
    expect(screen.getByLabelText('Words in the search box')).toHaveValue('Ask: challah')
  })

  // Regression: the photo uploads through ImageUploadField, the same as a
  // category icon or listing photo, so it can be repositioned afterwards.
  // The user, Nov 4: no description to fill in; the photo is decoration
  // (HeroHeading gives it an empty alt).
  it('the photo can be repositioned, and asks for no description', async () => {
    await renderEditor({ ...SITE_SETTINGS_DEFAULTS, desktopHeroImage: { url: 'https://example.com/hero.jpg', alt: 'City Hall' } })
    expect(within(screen.getByRole('region', { name: 'Top of the page' })).getByRole('button', { name: 'Adjust photo' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/description/i)).toBeNull()
    expect(screen.queryByDisplayValue('City Hall')).toBeNull()
  })

  // The user, Nov 4: the logo and the photo upload as a listing's photo
  // does: no hint under the buttons, and the address behind "Paste URL"
  // rather than always open.
  it('the logo and the photo upload as a listing’s photo does', async () => {
    const user = userEvent.setup()
    await renderEditor({ ...SITE_SETTINGS_DEFAULTS, logoUrl: 'https://example.com/logo.png', desktopHeroImage: { url: 'https://example.com/hero.jpg', alt: '' } })
    expect(screen.queryByText('Click the preview to reposition/re-zoom it')).toBeNull()
    expect(screen.queryByText('…or paste an image URL directly')).toBeNull()
    expect(screen.queryByDisplayValue('https://example.com/logo.png')).toBeNull()
    for (const box of ['Name and logo', 'Top of the page']) {
      expect(within(screen.getByRole('region', { name: box })).getByRole('button', { name: 'Paste URL' })).toHaveAttribute('aria-pressed', 'false')
    }
    await user.click(within(screen.getByRole('region', { name: 'Name and logo' })).getByRole('button', { name: 'Paste URL' }))
    expect(screen.getByLabelText('Image URL')).toHaveValue('https://example.com/logo.png')
  })

  it('has no Save bar until something changes, then says how much', async () => {
    const user = userEvent.setup()
    await renderEditor()
    expect(saveBar()).toBeNull()
    await user.type(screen.getByLabelText('Words in the search box'), '!')
    expect(within(saveBar()!).getByText('1 change')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Big line'), '!')
    expect(within(saveBar()!).getByText('2 changes')).toBeInTheDocument()
  })

  it('Undo puts every field back and takes the bar away', async () => {
    const user = userEvent.setup()
    await renderEditor({ ...SITE_SETTINGS_DEFAULTS, desktopHeroHeadline: 'Original' })
    const big = screen.getByLabelText('Big line')
    await user.clear(big)
    await user.type(big, 'Changed')
    await user.click(within(saveBar()!).getByRole('button', { name: 'Undo' }))
    expect(screen.getByLabelText('Big line')).toHaveValue('Original')
    expect(saveBar()).toBeNull()
  })

  it('Save sends the settings and says it saved', async () => {
    const user = userEvent.setup()
    await renderEditor()
    await user.type(screen.getByLabelText('Words in the search box'), '!')
    await saveWith(user, { ...SITE_SETTINGS_DEFAULTS, searchPlaceholder: `${SITE_SETTINGS_DEFAULTS.searchPlaceholder}!` })
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/site-settings?community=philly',
      expect.objectContaining({ method: 'PATCH', headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
      'Save failed.',
    )
    expect(sentBody().searchPlaceholder).toBe(`${SITE_SETTINGS_DEFAULTS.searchPlaceholder}!`)
  })

  // Regression: sectionsEqual once left `width` out, so flipping a card
  // between Full and Half width never counted as a change. Its rows now.
  it('a card moving into another’s row is a change', async () => {
    const user = userEvent.setup()
    await renderEditor(SITE_SETTINGS_DEFAULTS, [
      { id: 'davening', kind: 'davening', title: 'Davening Times Card', sortOrder: 0, cardIds: [], sharesRow: false },
      { id: 'subscribe', kind: 'subscribe', title: 'Email Signup Card', sortOrder: 1, cardIds: [], sharesRow: false },
    ])
    screen.getByRole('button', { name: 'Move Davening Times' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(within(saveBar()!).getByText('1 change')).toBeInTheDocument()
  })

  // The user, Nov 4: "Don't say how many people signed up".
  it('the email sign-up card says nothing about who signed up, and asks for no list', async () => {
    await renderEditor(SITE_SETTINGS_DEFAULTS, [
      { id: 'subscribe', kind: 'subscribe', title: 'Email Signup Card', sortOrder: 0, cardIds: [], sharesRow: false },
    ])
    expect(screen.getByRole('button', { name: `Take ${SITE_SETTINGS_DEFAULTS.desktopSubscribeHeading} off` })).toBeInTheDocument()
    expect(screen.queryByText(/signed up|subscri/i)).toBeNull()
    expect(vi.mocked(global.fetch).mock.calls.some(([url]) => String(url).includes('/api/admin/subscribers'))).toBe(false)
  })

  it('shows the home page beside the settings, with what hasn’t been saved', async () => {
    const user = userEvent.setup()
    await renderEditor()
    const frame = await screen.findByTitle('Preview', {}, { timeout: 2000 })
    expect(frame).toHaveAttribute('src', '/philly?preview=1')
    await user.type(screen.getByLabelText('Big line'), '!')
    await waitFor(() => expect(vi.mocked(writePreviewDraft).mock.lastCall![0].settings.desktopHeroHeadline).toBe(`${SITE_SETTINGS_DEFAULTS.desktopHeroHeadline}!`), {
      timeout: 2000,
    })
    // The switch at the top is the preview's too; it has none of its own.
    expect(screen.queryByRole('group', { name: 'Preview on' })).toBeNull()
    await show(user, 'Phone')
    expect(within(screen.getByRole('group', { name: 'Show the page on' })).getByRole('button', { name: 'Phone' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTitle('Preview').parentElement!.style.width).toBe('390px')
  })

  // The user, Nov 5: on an iPhone the page kept jumping back to the top.
  // Hidden on a phone, the preview still loaded the whole home page.
  it('on a phone, loads no preview beside the settings', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('max-width'), media: q, addEventListener() {}, removeEventListener() {} }))
    const user = userEvent.setup()
    await renderEditor()
    await show(user, 'Phone')
    await new Promise((r) => setTimeout(r, 900))
    expect(screen.queryByTitle('Preview')).toBeNull()
    expect(writePreviewDraft).not.toHaveBeenCalled()
  })

  // Narrower than the preview beside needs (a phone), a Preview button
  // opens the page full size, with what hasn't been saved (board 21c).
  it('Preview opens the home page full size, with what hasn’t been saved', async () => {
    const user = userEvent.setup()
    await renderEditor()
    await user.type(screen.getByLabelText('Big line'), '?')
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(vi.mocked(writePreviewDraft).mock.lastCall![0].settings.desktopHeroHeadline).toBe(`${SITE_SETTINGS_DEFAULTS.desktopHeroHeadline}?`)
    expect(screen.getByTitle('Site preview')).toHaveAttribute('src', '/philly?preview=1')
    await user.click(screen.getByRole('button', { name: '← Back to editor' }))
    await waitFor(() => expect(screen.queryByTitle('Site preview')).toBeNull())
    expect(screen.getByLabelText('Big line')).toHaveValue(`${SITE_SETTINGS_DEFAULTS.desktopHeroHeadline}?`)
  })

  // Browser Back closed nothing: it left the page, a step too far, and
  // Forward after "Back to editor" did nothing (the user, Nov 4).
  it('browser Back closes the full-size preview, and Forward opens it again', async () => {
    const user = userEvent.setup()
    await renderEditor()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(history.state?.editorPreview).toBe(true)

    act(() => history.back())
    await waitFor(() => expect(screen.queryByTitle('Site preview')).toBeNull())
    await user.type(screen.getByLabelText('Big line'), '!')

    act(() => history.forward())
    await waitFor(() => expect(screen.getByTitle('Site preview')).toBeInTheDocument())
    // What's typed now, not what was typed when it first opened.
    expect(vi.mocked(writePreviewDraft).mock.lastCall![0].settings.desktopHeroHeadline).toBe(`${SITE_SETTINGS_DEFAULTS.desktopHeroHeadline}!`)

    await user.click(screen.getByRole('button', { name: '← Back to editor' }))
    await waitFor(() => expect(screen.queryByTitle('Site preview')).toBeNull())
    act(() => history.forward())
    await waitFor(() => expect(screen.getByTitle('Site preview')).toBeInTheDocument())
  })

  // Like a screenshot here: the small one opens big (the user, Nov 4).
  it('clicking the preview beside opens it full size, with what hasn’t been saved', async () => {
    const user = userEvent.setup()
    await renderEditor()
    await user.type(screen.getByLabelText('Big line'), '?')
    await user.click(await screen.findByRole('button', { name: 'Open the preview' }, { timeout: 2000 }))
    expect(vi.mocked(writePreviewDraft).mock.lastCall![0].settings.desktopHeroHeadline).toBe(`${SITE_SETTINGS_DEFAULTS.desktopHeroHeadline}?`)
    expect(screen.getByTitle('Site preview')).toHaveAttribute('src', '/philly?preview=1')
  })

  // The Today home is a phone's home page only.
  it('the Today home box is with the phone’s boxes', async () => {
    const user = userEvent.setup()
    await renderEditor()
    expect(screen.queryByTestId('home-style')).toBeNull()
    await show(user, 'Phone')
    expect(boxes()).toEqual(['Name and logo', 'Search box', 'Today home', 'Tabs'])
  })

  // Held back (features.ts): nothing to choose, so the box isn't there.
  it('while the Today home is held back, there is no Today home box', async () => {
    const user = userEvent.setup()
    features.todayHome = false
    try {
      await renderEditor()
      await show(user, 'Phone')
      expect(screen.queryByTestId('home-style')).not.toBeInTheDocument()
      expect(screen.queryByTestId('today-blocks')).not.toBeInTheDocument()
    } finally {
      features.todayHome = true
    }
  })

  it('choosing the Today home and saving sends it', async () => {
    const user = userEvent.setup()
    await renderEditor()
    await show(user, 'Phone')
    const choice = within(screen.getByTestId('home-style'))
    expect(choice.getByRole('radio', { name: /^Classic/ })).toBeChecked()
    await user.click(choice.getByRole('radio', { name: /^Today/ }))
    await saveWith(user, { ...SITE_SETTINGS_DEFAULTS, homeStyle: 'today' })
    expect(sentBody().homeStyle).toBe('today')
  })

  it('Before candles’ items are one line of names, saved as a list', async () => {
    const user = userEvent.setup()
    await renderEditor()
    await show(user, 'Phone')
    const input = screen.getByRole('textbox', { name: /^Before candles looks for/ })
    expect(input).toHaveValue('Challah, Wine, Chicken')
    await user.clear(input)
    await user.type(input, 'Challah, Grape juice, ')
    expect(input).toHaveValue('Challah, Grape juice, ')
    await saveWith(user, { ...SITE_SETTINGS_DEFAULTS, beforeCandleItems: ['Challah', 'Grape juice'] })
    expect(sentBody().beforeCandleItems).toEqual(['Challah', 'Grape juice'])
  })

  it('each Today block can be left off, and is saved as off', async () => {
    const user = userEvent.setup()
    await renderEditor()
    await show(user, 'Phone')
    const blocks = within(screen.getByTestId('today-blocks'))
    expect(blocks.getAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)).toEqual([true, true, true, true, true, true, true])
    await user.click(blocks.getByRole('checkbox', { name: /^Open now/ }))
    await saveWith(user, { ...SITE_SETTINGS_DEFAULTS, todayHidden: ['openNow'] })
    expect(sentBody().todayHidden).toEqual(['openNow'])
    expect(blocks.getByRole('checkbox', { name: /^Open now/ })).not.toBeChecked()
  })
})

describe('SiteSettingsEditor — the header', () => {
  // Feedback moved to the Forms tab (FeedbackEditor.test.tsx). The name and
  // logo came back from Settings (the user, Nov 4: "Why does settings have
  // name and logo there? Versus site"): they're the header's.
  it('the phone’s tabs have no count beside them', async () => {
    const user = userEvent.setup()
    await renderEditor()
    await show(user, 'Phone')
    expect(screen.getByRole('heading', { name: 'Tabs' }).parentElement!.textContent).toBe('Tabs')
  })

  it('saves the name with the rest of the header', async () => {
    const user = userEvent.setup()
    await renderEditor({ ...SITE_SETTINGS_DEFAULTS, name: 'Old name' })
    const name = screen.getByLabelText('Name', { exact: true })
    expect(name).toHaveValue('Old name')
    await user.clear(name)
    await user.type(name, 'Philly Jewish Guide')
    await saveWith(user, { ...SITE_SETTINGS_DEFAULTS, name: 'Philly Jewish Guide' })
    expect(sentBody()).toEqual({ name: 'Philly Jewish Guide' })
  })

  // Forms saves the feedback form on its own. This draft may hold what it
  // was before, so sending it whole put it back.
  it('saves only what changed here', async () => {
    const user = userEvent.setup()
    await renderEditor({ ...SITE_SETTINGS_DEFAULTS, name: 'Old name', feedbackHeading: 'Old heading' })
    const top = screen.getByRole('region', { name: 'Header' })
    await user.click(within(top).getByRole('button', { name: 'Map' }))
    await user.click(within(top).getAllByRole('button', { name: 'Take Map off' })[0]!)
    await saveWith(user, SITE_SETTINGS_DEFAULTS)
    expect(Object.keys(sentBody())).toEqual(['desktopNavItems'])
  })

  // Regression: the editor showed the default items whenever the draft's list
  // was empty, so removing the last item brought the defaults back on screen
  // and Save then failed for a list the admin could see wasn't empty.
  it('removing every top-of-the-page item leaves it empty, with the warning', async () => {
    const user = userEvent.setup()
    await renderEditor()
    const warning = /The nav needs at least one item/
    const top = screen.getByRole('region', { name: 'Header' })
    for (let i = 0; i < 10 && !screen.queryByText(warning); i++) {
      await user.click(within(top).getAllByRole('button', { expanded: false })[0])
      // The open tab's trash can is last, after its links' ×s.
      await user.click(within(top).getAllByRole('button', { name: /^Take .* off$/ }).at(-1)!)
    }
    expect(screen.getByText(warning)).toBeInTheDocument()
  })
})

describe('countChanges', () => {
  it('counts each setting changed, and the sections as one', () => {
    const sections = [{ id: 'a', kind: 'section' as const, title: 'A', cardIds: [], sharesRow: false }]
    expect(countChanges(SITE_SETTINGS_DEFAULTS, SITE_SETTINGS_DEFAULTS, sections, sections)).toBe(0)
    expect(countChanges(SITE_SETTINGS_DEFAULTS, { ...SITE_SETTINGS_DEFAULTS, name: 'x', mission: 'y' }, sections, sections)).toBe(2)
    expect(countChanges(SITE_SETTINGS_DEFAULTS, SITE_SETTINGS_DEFAULTS, sections, [{ ...sections[0], title: 'B' }])).toBe(1)
  })
})
