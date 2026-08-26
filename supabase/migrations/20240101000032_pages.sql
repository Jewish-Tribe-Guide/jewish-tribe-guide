-- ─────────────────────────────────────────────────────────────────────────────
-- Static content pages (About, Privacy, ...) editable from the admin console.
--
-- One row per page, keyed by a fixed slug the app already knows how to route
-- (see src/app/about/page.tsx). Global, not per-community — same reasoning as
-- /admin and /privacy already living outside /[community]: this is one site's
-- worth of copy, not something Baltimore and Philadelphia need to diverge on.
--
-- Plain text body (paragraphs separated by a blank line), matching how the
-- rest of the admin-editable copy in this app works (site_settings, category
-- descriptions) rather than introducing markdown/HTML rendering.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists page (
  slug        text primary key,
  title       text not null,
  body        text not null default '',
  updated_at  timestamptz not null default now()
);

-- Public reference data — rendered directly on public pages, same as
-- `site_settings` and `category`.
alter table page enable row level security;
create policy "public reads pages" on page for select using (true);

-- 'about' seeds as a placeholder — there's no existing About page to lose.
-- 'privacy' seeds with the real policy text that used to be hardcoded in
-- src/app/privacy/page.tsx, so switching that page to read from this table
-- doesn't blank out live, legally-relevant copy. The renderer treats each
-- blank-line-separated chunk as one paragraph, with no heading markup — the
-- section titles below read fine as a bolded first paragraph of their own,
-- and this pass isn't trying to reproduce the exact old layout, just carry
-- the words over intact. The mailto link and "last updated" line are handled
-- by the page component itself, not stored here.
insert into page (slug, title, body) values
  ('about', 'About', 'Hello World'),
  ('privacy', 'Privacy Policy', $$The Philadelphia Jewish Community guide ("this site") is a directory of Jewish community resources — synagogues, food, lodging, and more — for residents, visitors, and hospital patients and their families. This page explains what information we collect, why, and what we do with it.

Browsing the directory

You can search, filter, and browse every listing without providing any personal information at all. No account, no sign-up, no email required.

If you reach out through a form

The site has a few forms — requesting support, signing up to volunteer, sending feedback, or a custom form we've set up. For a support or volunteer request (or a custom form), we ask for your name and at least one way to reach you (phone and/or email), because a real person on our team needs to know who's asking and how to follow up. Sending feedback doesn't require any of that — you can leave it blank. Either way, we only ask for this so our team can respond to that specific request. We use it to reply to you, and for nothing else. We never sell it, use it for marketing, or share it with anyone outside the small team of volunteers and staff who handle these requests.

Where it goes: your submission is saved in our database and, for support/volunteer/feedback requests, also recorded in a shared spreadsheet our volunteer coordination team uses day-to-day. Our team also gets a notification, and you'll get a confirmation email if you gave us an email address. All of this is solely to make sure your request actually gets handled by a real person.

If you suggest or report a listing

When you suggest a new listing, propose an edit, or report a problem with one, you can optionally leave a name and email so we can follow up if we have a question. Same rule as above: used only to review that submission, nothing else.

Location

If you choose to share your location (to see distances or get directions), that stays on your own device — your coordinates are never sent to or stored on our servers. You can turn location sharing off at any time from the location indicator on the site.

What's stored on your device

To make the site more useful, your browser locally remembers a few things — which community you're viewing, listings you've pinned as favorites, and prompts you've already dismissed. This stays on your own device and is never sent to us.

Anonymous usage data

We use privacy-respecting analytics to understand things like which pages get visited and which categories people search for — this is aggregate and not tied to your identity. We also use automated error monitoring so we notice and fix things that break; this can capture technical details like your browser and device type when something goes wrong, but not the content of anything you typed.

Services we rely on

Running the site means a handful of reputable outside providers handle pieces of it — hosting, our database, map and address lookups, spam protection on forms, and error monitoring. Each one only ever gets access to what it needs to do that specific job, for no purpose beyond what's described on this page.

Questions or requests

If you have a question about this policy, or want us to delete information you've previously sent us, email us and we'll take care of it.$$)
on conflict (slug) do nothing;
