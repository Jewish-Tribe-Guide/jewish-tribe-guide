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
- **Resend** (email) · **Upstash** (rate limiting) · **Cloudflare Turnstile**
  (spam) · **Google Sheets** (system-of-record for support/volunteer requests)

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

### 2. Logo & favicon

- **In-app mark:** replace the `StarOfDavid` SVG in `src/components/icons.tsx`.
- **Browser / home-screen icon:** replace `src/app/favicon.ico`.

### 3. Location data — `src/data/`

The directory anchors on the visitor's typed address, so **hospitals are
optional**. For a general (non-patient) community, set `hospitals = []` in
`src/data/hospitals.js` and turn off the patient-oriented `features`
(`medicalResources`, `patientSupport`, `volunteer`) — those cards, the hospital
map pins, and the "About Your Hospital" pages all disappear, and zmanim/eruv
anchor on `community.mapCenter` + `community.timezone` instead.

- `hospitals` — coordinates + timezone per hospital; only used by the patient
  module (map pins, volunteer form, "About Your Hospital"). Leave empty if your
  community isn't hospital-oriented.
- `resources.js → eruvim` — read directly at runtime; edit for your community's
  eruvim.

### 4. Backend & initial content

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
   own; each documents what it loads at the top.

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

## License

[MIT](LICENSE) — free to fork, adapt, and deploy for your own community.
Attribution appreciated but not required.

## Conventions

See `AGENTS.md` for repository conventions before contributing code.
