# Jewish Community Directory

A single-screen guide to a local Jewish community — kosher food, synagogues,
mikvaos, eruv status, Shabbos times, an interactive map, and (optionally)
support for hospital patients and their families. It's built as a **reusable
template**: standing up a new community is mostly editing one config file plus a
few assets, not touching component code.

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
- `region`, `mapCenter` — the area label used in copy and the map's default
  center.
- `themeColor`, `backgroundColor` — browser chrome / PWA colors. **Also update
  the matching brand color in `src/app/globals.css`** (`@theme --color-primary`)
  so the Tailwind `primary` utilities match `themeColor`.
- `features` — turn off any hand-built module a community doesn't need
  (`eruv`, `zmanim`, `medicalResources`, `patientSupport`, `volunteer`). The
  card and its page/flow disappear when a flag is `false`.

### 2. Logo & favicon

- **In-app mark:** replace the `StarOfDavid` SVG in `src/components/icons.tsx`.
- **Browser / home-screen icon:** replace `src/app/favicon.ico`.

### 3. Location data — `src/data/`

- `hospitals` — coordinates + timezone per hospital (drives the map's hospital
  pins, the volunteer form, and zmanim). Leave empty for a non-hospital
  community (and turn off the patient-oriented `features`).
- `resources.js → eruvim` — read directly at runtime; edit for your community's
  eruvim.

### 4. Backend & initial content

1. Create a Supabase project; set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
2. Run the SQL in `supabase/*.sql` (schema, categories, submissions, votes,
   travel) in the Supabase SQL editor to create the tables.
3. Enable the Google **Places API** and **Maps JavaScript API**, then set
   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
4. Replace the starter content in `src/data/` (`resources.js`, `synagogues.js`)
   with your own, then load it with the seed scripts in `scripts/` — each
   documents what it loads and how to run it, e.g.:

   ```bash
   node --env-file=.env.local scripts/seed-categories.mjs
   node --env-file=.env.local scripts/seed.mjs
   ```

### 5. Deploy

Deploy to any Next.js host (e.g. Vercel) and set the same environment variables
in the hosting dashboard.

## Conventions

See `AGENTS.md` for repository conventions before contributing code.
