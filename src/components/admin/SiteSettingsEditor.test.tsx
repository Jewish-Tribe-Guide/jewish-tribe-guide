// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, within, screen, waitFor } from '@testing-library/react'
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

async function renderEditor(section: 'home' | 'menus', settings = SITE_SETTINGS_DEFAULTS, sections: HomeSection[] = []) {
  mockLoad(settings, sections)
  const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
  renderWithProviders(<SiteSettingsEditor token="tok" section={section} />, {
    content: { categories: [grocery] },
    community: makeCommunity({ slug: 'philly' }),
  })
  await screen.findByRole('complementary', { name: 'Preview' })
}

const saveBar = () => screen.queryByRole('region', { name: 'Save' })
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
  it('sorts its settings by what they change on the home page', async () => {
    await renderEditor('home')
    const boxes = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(boxes).toEqual(['Top of the page', 'Below it, in this order', 'Category groups', 'Today home', 'In link previews and search results'])
    // The header's settings are on their own tab.
    expect(screen.queryByText('Tabs, on a phone')).toBeNull()
  })

  it('names each field by what a visitor sees', async () => {
    await renderEditor('home', {
      ...SITE_SETTINGS_DEFAULTS,
      desktopHeroHeadline: 'Your guide',
      desktopHeroSubhead: 'Kept current by you',
      searchPlaceholder: 'Ask: challah',
    })
    expect(screen.getByLabelText('Big line')).toHaveValue('Your guide')
    expect(screen.getByLabelText('Line under it')).toHaveValue('Kept current by you')
    expect(screen.getByLabelText('Search box')).toHaveValue('Ask: challah')
    expect(screen.getByLabelText('Title')).toHaveValue(SITE_SETTINGS_DEFAULTS.heroTitle)
    expect(screen.getByLabelText('Description')).toHaveValue(SITE_SETTINGS_DEFAULTS.mission)
  })

  // Regression: the photo uploads through ImageUploadField, the same as a
  // category icon or listing photo, so it can be repositioned afterwards.
  it('the photo can be repositioned, and described once there is one', async () => {
    await renderEditor('home', { ...SITE_SETTINGS_DEFAULTS, desktopHeroImage: { url: 'https://example.com/hero.jpg', alt: 'City Hall' } })
    expect(screen.getByText('Click the preview to reposition/re-zoom it')).toBeInTheDocument()
    expect(screen.getByLabelText('Photo, described')).toHaveValue('City Hall')
  })

  it('has no Save bar until something changes, then says how much', async () => {
    const user = userEvent.setup()
    await renderEditor('home')
    expect(saveBar()).toBeNull()
    await user.type(screen.getByLabelText('Search box'), '!')
    expect(within(saveBar()!).getByText('1 change')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Big line'), '!')
    expect(within(saveBar()!).getByText('2 changes')).toBeInTheDocument()
  })

  it('Undo puts every field back and takes the bar away', async () => {
    const user = userEvent.setup()
    await renderEditor('home', { ...SITE_SETTINGS_DEFAULTS, desktopHeroHeadline: 'Original' })
    const big = screen.getByLabelText('Big line')
    await user.clear(big)
    await user.type(big, 'Changed')
    await user.click(within(saveBar()!).getByRole('button', { name: 'Undo' }))
    expect(screen.getByLabelText('Big line')).toHaveValue('Original')
    expect(saveBar()).toBeNull()
  })

  it('Save sends the settings and says it saved', async () => {
    const user = userEvent.setup()
    await renderEditor('home')
    await user.type(screen.getByLabelText('Search box'), '!')
    await saveWith(user, { ...SITE_SETTINGS_DEFAULTS, searchPlaceholder: `${SITE_SETTINGS_DEFAULTS.searchPlaceholder}!` })
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/admin/site-settings?community=philly',
      expect.objectContaining({ method: 'PATCH', headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
      'Save failed.',
    )
    expect(sentBody().searchPlaceholder).toBe(`${SITE_SETTINGS_DEFAULTS.searchPlaceholder}!`)
  })

  // Regression: sectionsEqual once left `width` out, so flipping a card
  // between Full and Half width never counted as a change.
  it('a card’s width is a change', async () => {
    const user = userEvent.setup()
    await renderEditor('home', SITE_SETTINGS_DEFAULTS, [
      { id: 'subscribe', kind: 'subscribe', title: 'Email Signup Card', sortOrder: 0, cardIds: [], width: 'full' },
    ])
    await user.click(screen.getByRole('button', { name: SITE_SETTINGS_DEFAULTS.desktopSubscribeHeading }))
    await user.click(screen.getByRole('button', { name: 'Half width' }))
    expect(within(saveBar()!).getByText('1 change')).toBeInTheDocument()
  })

  it('shows the home page beside the settings, with what hasn’t been saved', async () => {
    const user = userEvent.setup()
    await renderEditor('home')
    const frame = await screen.findByTitle('Preview', {}, { timeout: 2000 })
    expect(frame).toHaveAttribute('src', '/philly?preview=1')
    await user.type(screen.getByLabelText('Big line'), '!')
    await waitFor(() => expect(vi.mocked(writePreviewDraft).mock.lastCall![0].settings.desktopHeroHeadline).toBe(`${SITE_SETTINGS_DEFAULTS.desktopHeroHeadline}!`), {
      timeout: 2000,
    })
    await user.click(screen.getByRole('button', { name: 'Phone' }))
    expect(screen.getByRole('button', { name: 'Phone' })).toHaveAttribute('aria-pressed', 'true')
  })

  // Held back (features.ts): nothing to choose, so the box isn't there.
  it('while the Today home is held back, there is no Today home box', async () => {
    features.todayHome = false
    try {
      await renderEditor('home')
      expect(screen.queryByTestId('home-style')).not.toBeInTheDocument()
      expect(screen.queryByTestId('today-blocks')).not.toBeInTheDocument()
    } finally {
      features.todayHome = true
    }
  })

  it('choosing the Today home and saving sends it', async () => {
    const user = userEvent.setup()
    await renderEditor('home')
    const choice = within(screen.getByTestId('home-style'))
    expect(choice.getByRole('radio', { name: /^Classic/ })).toBeChecked()
    await user.click(choice.getByRole('radio', { name: /^Today/ }))
    await saveWith(user, { ...SITE_SETTINGS_DEFAULTS, homeStyle: 'today' })
    expect(sentBody().homeStyle).toBe('today')
  })

  it('Before candles’ items are one line of names, saved as a list', async () => {
    const user = userEvent.setup()
    await renderEditor('home')
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
    await renderEditor('home')
    const blocks = within(screen.getByTestId('today-blocks'))
    expect(blocks.getAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)).toEqual([true, true, true, true, true, true, true])
    await user.click(blocks.getByRole('checkbox', { name: /^Open now/ }))
    await saveWith(user, { ...SITE_SETTINGS_DEFAULTS, todayHidden: ['openNow'] })
    expect(sentBody().todayHidden).toEqual(['openNow'])
    expect(blocks.getByRole('checkbox', { name: /^Open now/ })).not.toBeChecked()
  })
})

describe('SiteSettingsEditor — Header and menus', () => {
  it('holds the name and logo, the computer’s top of the page, the phone’s tabs and feedback', async () => {
    await renderEditor('menus')
    const boxes = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(boxes).toEqual(['Name and logo', 'Top of the page, on a computer', 'Tabs, on a phone', 'Feedback'])
    expect(screen.queryByText('Below it, in this order')).toBeNull()
  })

  it('shows the name, and a logo that can be repositioned', async () => {
    await renderEditor('menus', { ...SITE_SETTINGS_DEFAULTS, name: 'Test Directory', logoUrl: 'https://example.com/logo.png' })
    expect(screen.getByLabelText('Name')).toHaveValue('Test Directory')
    expect(screen.getByText('Click the preview to reposition/re-zoom it')).toBeInTheDocument()
  })

  it('turning feedback off hides its words, and is a change', async () => {
    const user = userEvent.setup()
    await renderEditor('menus', { ...SITE_SETTINGS_DEFAULTS, feedbackEnabled: true })
    expect(screen.getByLabelText('Button')).toHaveValue(SITE_SETTINGS_DEFAULTS.feedbackButtonLabel)
    await user.click(screen.getByRole('switch', { name: 'Feedback on the site' }))
    expect(screen.queryByLabelText('Button')).toBeNull()
    expect(within(saveBar()!).getByText('1 change')).toBeInTheDocument()
  })

  // Regression: the editor showed the default items whenever the draft's list
  // was empty, so removing the last item brought the defaults back on screen
  // and Save then failed for a list the admin could see wasn't empty.
  it('removing every top-of-the-page item leaves it empty, with the warning', async () => {
    const user = userEvent.setup()
    await renderEditor('menus')
    const warning = /The nav needs at least one item/
    for (let i = 0; i < 10 && !screen.queryByText(warning); i++) {
      await user.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    }
    expect(screen.getByText(warning)).toBeInTheDocument()
  })
})

describe('countChanges', () => {
  it('counts each setting changed, and the sections as one', () => {
    const sections = [{ id: 'a', kind: 'section' as const, title: 'A', cardIds: [], width: 'full' as const }]
    expect(countChanges(SITE_SETTINGS_DEFAULTS, SITE_SETTINGS_DEFAULTS, sections, sections)).toBe(0)
    expect(countChanges(SITE_SETTINGS_DEFAULTS, { ...SITE_SETTINGS_DEFAULTS, name: 'x', mission: 'y' }, sections, sections)).toBe(2)
    expect(countChanges(SITE_SETTINGS_DEFAULTS, SITE_SETTINGS_DEFAULTS, sections, [{ ...sections[0], title: 'B' }])).toBe(1)
  })
})
