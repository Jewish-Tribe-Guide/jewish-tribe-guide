import { SkylineIcon } from '@/components/icons'
import type { SiteSettings } from '@/lib/siteSettings'

// ── The very last thing on the desktop home screen, below every card —
// desktop mockup match (Phase 7, docs/desktop-mockup-plan.md). Sits directly
// on the page's own cream ground rather than in a white card, so it reads as
// a closing line rather than one more section competing with the cards
// above it.
//
// Reuses SkylineIcon (Phase 3's hero silhouette) rather than drawing a
// second, stroke-only version of the same skyline — the mockup shows this
// smaller copy as line art, but a second icon component for one decorative
// glyph difference wasn't worth the duplication; the filled glyph at this
// size and in a plain slate tone reads close enough to the mockup's intent.
//
// The left block used to be a hardcoded "A more connected {region}" plus a
// fixed sentence naming the site — replaced with the same {name}/{mission}
// pair SiteFooter's own left column shows, so an admin editing either in
// the console (Desktop tab) doesn't have this strip quietly drift out of
// sync with the footer beneath it.
export default function ClosingStrip({ settings }: { settings: Pick<SiteSettings, 'name' | 'mission'> }) {
  return (
    <div className="hidden desktop:flex mt-8 mb-4 items-center gap-8">
      <SkylineIcon className="h-14 w-[120px] shrink-0 text-slate-600" />
      <div className="flex-1">
        <p className="text-lg font-semibold text-ink">{settings.name}</p>
        <p className="mt-1 max-w-[460px] text-[13px] text-slate-500">{settings.mission}</p>
      </div>
      <div className="self-stretch w-px bg-slate-200" />
      <div className="shrink-0 text-right">
        <p className="font-serif text-[15px] leading-snug text-ink">
          Same people.
          <br />
          A stronger community.
        </p>
        <div className="mt-2 ml-auto h-0.5 w-7 bg-gold" />
      </div>
    </div>
  )
}
