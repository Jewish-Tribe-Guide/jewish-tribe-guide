'use client'

import SearchBar from '@/components/home/SearchBar'
import {
  CardRow,
  Section,
  directSupportCards,
  resourceCards,
  volunteerCards,
} from '@/components/home/sections'
import { useCategories } from '@/lib/useCategories'
import type { NavigateFn } from '@/types'

type Props = {
  onNavigate: NavigateFn
  /** Opens a service request form as a modal over the landing page. */
  onOpenService: (service: string) => void
}

// The landing page. The hero fork ("I'm a patient…" / "I live in the
// community") is the primary path — it leads to the per-audience pages. The
// browse area below (search + card sections) is for visitors who'd rather just
// scroll than work through the flow.
export default function Landing({ onNavigate, onOpenService }: Props) {
  const categories = useCategories()

  return (
    <>
      {/* ── Hero band: welcome + audience fork (its own white section) ───────── */}
      <section className="bg-white border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-14 sm:pb-16 text-center">
          <h1 className="text-3xl sm:text-[42px] font-bold tracking-tight text-slate-900 leading-tight">
            Welcome to Philadelphia&apos;s Jewish community.
          </h1>
          <p className="mt-3 max-w-2xl mx-auto text-[15px] sm:text-base text-slate-500">
            Kosher meals, rides, housing, visitors, and community resources for patients
            and families at Philadelphia hospitals.
          </p>

          <p className="mt-9 text-sm font-medium uppercase tracking-widest text-slate-400">
            I am…
          </p>
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onNavigate('patient', 'home')}
              className="w-full sm:w-auto rounded-full border border-slate-300 bg-white px-8 py-3.5 text-[15px] font-semibold text-slate-900 transition-all hover:border-slate-900 hover:shadow-md cursor-pointer"
            >
              a patient or family member
            </button>
            <button
              onClick={() => onNavigate('community', 'community-home')}
              className="w-full sm:w-auto rounded-full border border-slate-300 bg-white px-8 py-3.5 text-[15px] font-semibold text-slate-900 transition-all hover:border-slate-900 hover:shadow-md cursor-pointer"
            >
              a Philadelphia community member
            </button>
          </div>
        </div>
      </section>

      {/* ── Browse area: search + card sections (left-anchored, on the gray bg) ── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <div className="pt-12">
          <h2 className="text-[22px] font-bold tracking-tight text-slate-900">
            What are you looking for?
          </h2>
          <div className="mt-4 max-w-xl">
            <SearchBar onNavigate={onNavigate} onOpenService={onOpenService} />
          </div>
        </div>

        <Section
          title="Direct Support"
          subtitle="Request help from the community — a neighbor will take it from there."
          seeAllLabel="Request direct support"
          onSeeAll={() => onNavigate('patient', 'assist')}
        >
          <CardRow cards={directSupportCards(onOpenService, onNavigate)} />
        </Section>

        <Section
          title="Resources & Information"
          subtitle="Everything nearby, sorted by distance from your hospital or address."
          seeAllLabel="All resources"
          onSeeAll={() => onNavigate('patient', 'find')}
        >
          <CardRow cards={resourceCards(onNavigate, categories, { includeHospital: true })} tintOffset={2} />
        </Section>

        <Section
          title="Volunteer Opportunities"
          subtitle="The community runs on neighbors like you."
          seeAllLabel="Sign up"
          onSeeAll={() => onNavigate('community', 'give')}
        >
          <CardRow cards={volunteerCards(onNavigate)} tintOffset={4} />
        </Section>
      </main>
    </>
  )
}
