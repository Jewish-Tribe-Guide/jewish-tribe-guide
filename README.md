# Jewish Community Directory

A single-screen guide to a local Jewish community — kosher food, synagogues,
mikvaos, eruv status, Shabbos times, an interactive map, and (optionally)
support for hospital patients and their families. It's built as a **reusable
template**: standing up a new community is mostly editing one config file plus a
few assets, not touching component code.

> **Bringing this to your community?** Start with
> **[NEW-COMMUNITY.md](NEW-COMMUNITY.md)** — a plain-language intake of exactly
> what to provide (branding, content, accounts). This README below is the
> developer guide for wiring it up.

## Stack

- **Next.js** (App Router) · **React** · **Tailwind**
- **Supabase** — the resource directory + the submit → review → approve pipeline
- **Google Maps** — address autocomplete and the resource map
- **Resend** (email) · **Upstash** (rate limiting) · **Cloudflare Turnstile** (spam)

## Local development

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in the values — each variable is
   documented inline in `.env.example`. (`next` and the scripts load
   `.env.local` automatically.)
3. `npm run dev` → <http://localhost:3000>

Without Supabase/Maps keys the app still runs: directory listings are empty and
address/map features show a fallback notice.

## Rebrand for a new community

Everything community-specific is centralized. To stand up a new deployment:

### 1. Identity, theme & modules — `src/community.config.ts`

The single source of truth for branding. Edit:

- `name`, `shortName`, `tagline`, `mission` — shown in the header, footer, hero,
  and PWA manifest.
- `region`, `mapCenter`, `timezone` — the area label used in copy, the map's
  default center, and the IANA timezone for zmanim when a visitor is located by
  address (e.g. `America/Chicago`).
- `themeColor`, `backgroundColor` — browser chrome / PWA colors. `themeColor` is
  the single source for the brand color: it's injected as `--color-primary` so
  the Tailwind `primary` utilities track it automatically (the value in
  `globals.css` is only a fallback — no need to edit it).
- `features` — turn off any hand-built module a community doesn't need
  (`eruv`, `zmanim`, `medicalResources`, `patientSupport`, `volunteer`). The
  card and its page/flow disappear when a flag is `false`.
- `ui` — capability toggles for the app's affordances (all default on): public
  `contributions` (Add / Edit / Report — off = a curated, admin-only directory,
  enforced on the server too), `search` bars per screen (landing / directory /
  map), the `map` and its extras (live tracking, nearby list), and `upvotes`.
  Read through `src/lib/uiConfig.ts`, which applies the defaults so any key can
  be flipped or omitted. (General site feedback, including category requests,
  comes through the feedback form in the footer instead — no separate
  suggest-a-category path.)

### 2. Logo & favicon

- **In-app mark:** the header shows a pasted logo image URL set via the Site
  tab in `/admin` (`Logo`), or the built-in `StarOfDavid` SVG in
  `src/components/icons.tsx` if none is set.
- **Browser / home-screen icon:** replace `src/app/favicon.ico`.

### 3. Location data — `src/data/`

The directory anchors on the visitor's typed address, so **hospitals are
optional**. For a general (non-patient) community, set `hospitals = []` in
`src/data/hospitals.js` and turn off the patient-oriented `features`
(`medicalResources`, `patientSupport`, `volunteer`) — those cards, the hospital
map pins, and the "About Your Hospital" pages all disappear, and zmanim/eruv
anchor on `community.mapCenter` + `community.timezone` instead.

- `hospitals` (+ `hospitalInfo`) — starter data for the patient module (map pins,
  volunteer form, "About Your Hospital"). Seeded into the `hospital` DB table by
  `npm run setup`; the app then reads it from the database, so edit these files
  for your initial set (or leave `hospitals` empty for a non-hospital community).
- `resources.js → eruvim` — read directly at runtime; edit for your community's
  eruvim.

### 4. Backend & initial content

> New to the accounts/keys? **[SETUP.md](SETUP.md)** is a click-by-click
> walkthrough, and **`npm run doctor`** checks your env + database at any time
> and prints exactly what's missing and how to fix it.

1. Create a Supabase project; set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
2. **Apply the schema.** The ordered migrations live in `supabase/migrations/`.
   Either run `supabase db push` (Supabase CLI), or paste each file into the
   Supabase SQL editor **in filename order** (they're numbered by dependency).
   (Upgrading an existing deployment created before the hospital→anchor rename?
   Apply just the newest migration, `…_decouple_hospital_to_anchor.sql`, once.)
3. Enable the Google **Places API** and **Maps JavaScript API**, then set
   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
4. Choose your **directory categories** in `src/data/categories.js` (keep/drop/
   reorder/add — every seed follows it), and replace the starter content in
   `src/data/` (`resources.js`, `synagogues.js`) with your own.
5. **Seed the database** with one command — it preflights your env, verifies the
   schema, and runs every seed script in the right order (safe to re-run):

   ```bash
   npm run setup            # seed categories, tags, upvotes, listings, synagogues
   npm run setup -- --check # just verify env + schema, seed nothing
   ```

   The individual scripts in `scripts/` still exist if you need to run one on its
   own; each documents what it loads at the top. To bulk-load a category from a
   spreadsheet, use `npm run import -- <file.csv> --category <id>` (add
   `--dry-run` to preview) — addresses are geocoded automatically.

   **Prefer to start empty and crowdsource?** Clear the arrays in
   `src/data/resources.js` and `src/data/synagogues.js` (or just don't run
   `npm run seed`). The categories/tags still seed, so the directory is live and
   empty — visitors fill it in through the built-in **submit → review → approve**
   pipeline (an admin approves each addition at `/admin`). This is often the
   fastest way to launch: you don't have to source every listing up front.

### 5. Deploy

Deploy to any Next.js host and set the same environment variables in the hosting
dashboard. One-click on Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yhagler/jewish-patient-connect&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)

After cloning, add your environment variables in the Vercel project settings
(the values documented in `.env.example`), then apply the schema and seed as in
step 4 against your own Supabase project.

## Start a new community from this template

This repo is set up to be used as a **GitHub template**. To spin up a community:

1. Click **“Use this template” → “Create a new repository”** on GitHub (or
   [fork](https://github.com/yhagler/jewish-patient-connect/fork) it).
   *(Maintainer note: enable this under repo **Settings → Template repository**.)*
2. Work through **“Rebrand for a new community”** above — mostly
   `src/community.config.ts`, your logo/favicon, and `src/data/`.
3. Stand up Supabase + Google Maps, then `npm run setup`.
4. Deploy (the Vercel button above, or any Next.js host).

## Testing

`npm test` (unit + component) and `npm run test:e2e` (Playwright, against a
production build) need no setup beyond `npm ci` — see `AGENTS.md` for how
they're organized and what each is for.

### Integration tests

`npm run test:integration` exercises real Supabase reads/writes (the
submit → moderate → live-table pipeline in `src/lib/submissionStore.ts` and
friends) against a **second, disposable** Supabase project — never your real
one. It's optional for everyday work; skip it if `TEST_SUPABASE_URL` /
`TEST_SUPABASE_SERVICE_ROLE_KEY` aren't set.

`npm run test:cache-roundtrip` and `npm run test:form-roundtrip` use the
**same** test project to prove two things the real e2e suite can't (it's
barred from writing to the database):

- **Cache round-trip** — an admin's save actually reaches the cached public
  page. Boots a real production build against the test project
  (`scripts/run-test-project-server.mjs`), signs in as a fixed test-only
  admin (`cache-roundtrip-admin@test.invalid`, created automatically on
  first run), saves a setting through the real admin API, and polls the
  public home page until the new content appears, then reverts it.
- **Form submission** — a real wizard, filled out and submitted through the
  UI, actually reaches the database. Drives a real browser through a seeded
  test form (name → contact → a genuinely branching question → an optional
  final step), submits through `/api/requests`, confirms the response
  landed with the right data, then deletes it. No admin session needed —
  submitting is public.

`npm run test:admin-write` uses the same test project to drive the admin
console's actual write behavior — clicking Approve/Reject on a real
submission in `ModerationQueue`, the same buttons a human admin clicks —
rather than calling `approveSubmission()`/`rejectSubmission()` directly (the
integration suite) or only loading the signed-in UI read-only (the real e2e
suite's `admin.spec.ts`, which authenticates as the actual production admin
and is barred from writing for that reason). Seeds a pending submission
directly, verifies the resulting resource/submission rows, then cleans up.

All three need `TEST_SUPABASE_ANON_KEY` in addition to the integration
suite's two vars (they sign in for real, or their build needs it to boot
even when the test itself doesn't sign in).

To set the test project up:

1. Create a free Supabase project (same as step 1 above, but a new one —
   name it something like `<yourapp>-test`).
2. Apply the schema: `supabase db push` against it, or paste
   `supabase/migrations/*.sql` into its SQL editor in filename order. No
   seeding needed — all three suites create/delete/edit their own rows.
3. Add `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, and
   `TEST_SUPABASE_SERVICE_ROLE_KEY` (all under Project Settings → API on the
   *test* project) to `.env.local`.
4. For CI, add the same three as repo secrets (Settings → Secrets and
   variables → Actions) — see `.github/workflows/ci.yml`'s `integration`,
   `cache-roundtrip` and `form-roundtrip` jobs.

The integration suite cleans up the rows it creates in `afterEach`, tracked
by id rather than assumed, so a failed assertion still leaves the project
clean. The cache-round-trip and form-submission suites each revert/delete
the one thing they changed in a `finally` block, same guarantee.

**Using the test project for local dev too.** Supabase's free tier caps at 2
projects per account (not per organization — a new org doesn't get around
it), so a solo/small deployment that already has a real prod project and this
test project has nowhere free to put a separate "click around locally without
touching prod" dev project. If that's you, point `NEXT_PUBLIC_SUPABASE_URL`/
`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` at this same test
project and set `SHARED_DEV_TEST_PROJECT=1` — otherwise the write-test
suites' own safety check (which normally refuses to run if `TEST_SUPABASE_URL`
matches your main project, to stop them from ever touching real prod data)
refuses unconditionally once they're the same project on purpose. The
`DEV_ADMIN_BYPASS_SECRET` local-admin shortcut (see `AGENTS.md`) works
against whichever project `NEXT_PUBLIC_SUPABASE_URL` points to, no changes
needed there.

**Keeping it from drifting too far from prod.** A shared dev/test project
starts out empty (or minimal), so `npm run sync-dev-from-prod` pulls the
admin-configured content schema — categories, tags, forms, home sections,
site settings, hospitals — plus every approved listing, from the real
production project into whichever one `NEXT_PUBLIC_SUPABASE_URL` currently
points to. Prod is only ever read from; the script has no code path that
writes anywhere but the test project. Listings' `submitted_by` (the
submitter's own name/email, not the business's) is scrubbed to null on the
way in — the rest of a listing is public business info already shown on the
live site, but that one field is a real person's contact info with no reason
to leave prod. It still never touches `submission`, `form_response`, or
`vote` — genuinely private, not public content, and stays out of a shared
project on purpose. Needs `PROD_SUPABASE_URL`/`PROD_SUPABASE_SERVICE_ROLE_KEY`
in `.env.local` (the real project's own values — nothing else reads them),
and refuses to run unless the destination genuinely matches
`TEST_SUPABASE_URL`, so it can never write into prod by mistake. Upsert-only,
never deletes — a category or listing removed in prod will still need
deleting here by hand. Run it occasionally, not on every `npm run dev` —
there's no harm running it more often, it's just rarely worth the wait.

## License

[MIT](LICENSE) — free to fork, adapt, and deploy for your own community.
Attribution appreciated but not required.

## Conventions

See `AGENTS.md` for repository conventions before contributing code.
