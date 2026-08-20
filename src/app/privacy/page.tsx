import Link from 'next/link'
import type { Metadata } from 'next'
import { community } from '@/community.config'
import { siteUrl } from '@/lib/siteUrl'

export const metadata: Metadata = {
  title: `Privacy Policy — ${community.name}`,
  description: `What ${community.name} collects, why, and what we do with it.`,
  // Self-referencing canonical — same reasoning as every page under
  // [community] now has (see [community]/page.tsx's comment). Static rather
  // than a generateMetadata function since this page has nothing dynamic to
  // read; the path itself is a fixed literal, not a route param.
  alternates: { canonical: `${siteUrl()}/privacy` },
}

const CONTACT_EMAIL = process.env.NOTIFICATION_TO || 'phillyjewishguide@gmail.com'
const LAST_UPDATED = 'August 18, 2026'

// A plain, top-level page (not under /[community]) — privacy applies to the
// whole site, not one community, same reasoning as /offline and /admin
// living outside that segment. No data fetching needed, so this renders
// fully server-side with no client JS at all.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-16">
      <Link href="/" className="text-sm text-muted hover:text-slate-700 underline">
        ← Back to {community.name}
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted">Last updated: {LAST_UPDATED}</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-slate-700">
        <p>
          {`The ${community.name} guide (“this site”) is a directory of Jewish community resources — synagogues, food, lodging, and more — for residents, visitors, and hospital patients and their families. This page explains what information we collect, why, and what we do with it.`}
        </p>

        <section>
          <h2 className="text-base font-semibold text-slate-900">Browsing the directory</h2>
          <p className="mt-2">
            You can search, filter, and browse every listing without providing any personal information at
            all. No account, no sign-up, no email required.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">If you reach out through a form</h2>
          <p className="mt-2">
            The site has a few forms — requesting support, signing up to volunteer, sending feedback, or a
            custom form we&rsquo;ve set up. For a support or volunteer request (or a custom form), we ask
            for your name and at least one way to reach you (phone and/or email), because a real person on
            our team needs to know who&rsquo;s asking and how to follow up. Sending feedback doesn&rsquo;t
            require any of that — you can leave it blank. Either way, we only ask for this so our team can
            respond to <strong>that specific request</strong>. That&rsquo;s the only reason it exists:
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>We use it to reply to you, and for nothing else.</li>
            <li>
              We never sell it, use it for marketing, or share it with anyone outside the small team of
              volunteers and staff who handle these requests.
            </li>
          </ul>
          <p className="mt-2">
            <strong>Where it goes: </strong>your submission is saved in our database and, for
            support/volunteer/feedback requests, also recorded in a shared spreadsheet our volunteer
            coordination team uses day-to-day. Our team also gets a notification, and you&rsquo;ll get a
            confirmation email if you gave us an email address. All of this is solely to make sure your
            request actually gets handled by a real person.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">If you suggest or report a listing</h2>
          <p className="mt-2">
            When you suggest a new listing, propose an edit, or report a problem with one, you can
            optionally leave a name and email so we can follow up if we have a question. Same rule as
            above: used only to review that submission, nothing else.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">Location</h2>
          <p className="mt-2">
            If you choose to share your location (to see distances or get directions), that stays on your
            own device — your coordinates are never sent to or stored on our servers. You can turn location
            sharing off at any time from the location indicator on the site.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">What&rsquo;s stored on your device</h2>
          <p className="mt-2">
            To make the site more useful, your browser locally remembers a few things — which community
            you&rsquo;re viewing, listings you&rsquo;ve pinned as favorites, and prompts you&rsquo;ve
            already dismissed. This stays on your own device and is never sent to us.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">Anonymous usage data</h2>
          <p className="mt-2">
            We use privacy-respecting analytics to understand things like which pages get visited and
            which categories people search for — this is aggregate and not tied to your identity. We also
            use automated error monitoring so we notice and fix things that break; this can capture
            technical details like your browser and device type when something goes wrong, but not the
            content of anything you typed.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">Services we rely on</h2>
          <p className="mt-2">
            Running the site means a handful of reputable outside providers handle pieces of it —
            hosting, our database, map and address lookups, spam protection on forms, and error
            monitoring. Each one only ever gets access to what it needs to do that specific job, for no
            purpose beyond what&rsquo;s described on this page.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">Questions or requests</h2>
          <p className="mt-2">
            If you have a question about this policy, or want us to delete information you&rsquo;ve
            previously sent us, email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
              {CONTACT_EMAIL}
            </a>{' '}
            and we&rsquo;ll take care of it.
          </p>
        </section>
      </div>
    </main>
  )
}
