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
}

// The landing page. The hero fork ("I'm a patient…" / "I live in the
// community") is the primary path — it leads to the per-audience pages. The
// search bar and card sections below are for visitors who'd rather just scroll
// and browse without working through the flow.
export default function Landing({ onNavigate }: Props) {
  const categories = useCategories()

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
      {/* ── Hero: welcome + audience fork ────────────────────────────────────── */}
      <section className="pt-14 sm:pt-20 text-center">
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

        {/* ── Search ───────────────────────────────────────────────────────── */}
        <div className="mt-12 max-w-xl mx-auto">
          <SearchBar onNavigate={onNavigate} />
        </div>
      </section>

      {/* ── Browse-everything sections (secondary, for scrollers) ────────────── */}
      <Section
        title="Direct Support"
        subtitle="Request help from the community — a neighbor will take it from there."
        seeAllLabel="All services"
        onSeeAll={() => onNavigate('patient', 'assist')}
      >
        <CardRow cards={directSupportCards(onNavigate)} />
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
  )
}
