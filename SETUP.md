# Setup — getting the accounts & keys

This is the click-by-click version of standing up the backend: the accounts you
create, the values you copy, and where each one goes. It's the hardest part of
launching, so it's spelled out. You only do this once.

Everything you gather goes into a file called **`.env.local`** (copy it from
`.env.example`). At any point, run **`npm run doctor`** — it tells you exactly
what's set, what's missing, and how to fix it.

> **Minimum to go live:** just the **Supabase** steps below. The map, email, and
> spam-protection steps are optional — the app runs without them (with a small
> notice where a feature would be), and you can add them later.

---

## 1. Supabase (required — the database)

1. Go to **supabase.com**, sign in, and click **New project**. Pick a name and a
   strong database password; choose the region closest to your community.
2. Wait for it to provision (~2 min), then open **Project Settings → API**.
3. Copy these three values into `.env.local`:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (secret — keep it private) → `SUPABASE_SERVICE_ROLE_KEY`
4. **Create the tables.** In the Supabase dashboard open **SQL Editor**, and run
   each file in `supabase/migrations/` **in filename order** (they're numbered).
   Paste a file, click **Run**, repeat. (If you use the Supabase CLI instead,
   `supabase db push` does all of them at once.)
5. Set who can moderate: put your email in `ADMIN_EMAILS` (comma-separated for
   several). These are the accounts allowed into `/admin`.
6. Set who can read form submissions (support requests, volunteer signups,
   feedback): put email(s) in `INBOX_EMAILS`. This is a **separate** allowlist
   from `ADMIN_EMAILS` — those accounts are allowed into `/inbox`, not
   `/admin`, unless the same email is on both lists.

Now run **`npm run setup`** to seed your categories and starter content, then
**`npm run doctor`** — the Supabase rows should all show green.

---

## 2. Google Maps (optional — address autocomplete + the map)

Skip this and address fields become plain text boxes and the map shows a notice.
To enable it:

1. Go to **console.cloud.google.com** and create a project (top bar → **New
   Project**).
2. **APIs & Services → Library**, and **Enable** both:
   - **Maps JavaScript API**
   - **Places API**
3. **APIs & Services → Credentials → Create credentials → API key.** Copy it into
   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
4. **Restrict the key** (recommended): under the key's settings, set *Application
   restrictions → Websites* to your domain(s), and *API restrictions* to the two
   APIs above. (For local testing add `http://localhost:3000`.)
5. Optional: a second, unrestricted **server** key for geocoding typed addresses
   → `GOOGLE_MAPS_SERVER_KEY` (restrict it to the *Geocoding API* / your server
   IP). Without it, the app falls back to free OpenStreetMap geocoding.

---

## 3. Optional extras

Each is inert until you set it; the app works without them.

- **Resend** (`RESEND_API_KEY`, `RESEND_FROM`) — emails to submitters + admins.
  To email the public you must verify a domain at resend.com/domains and send
  from an address on it.
- **Upstash Redis** (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) —
  durable rate limiting. Without it a best-effort in-memory limiter is used.
- **Cloudflare Turnstile** (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
  `TURNSTILE_SECRET_KEY`) — CAPTCHA on public forms.
- **Google Sheets** (`GOOGLE_SHEETS_ID` + service-account vars) — logs
  support/volunteer requests to a spreadsheet. Only needed if those patient
  features are on.

Every variable is documented inline in **`.env.example`** — that file is the
authoritative list of names and where to find each value.

---

## 4. Check & deploy

1. `npm run doctor` — fix anything red. Aim for "All required checks passed."
2. `npm run dev` → <http://localhost:3000> to see it locally.
3. Deploy (the Vercel button in the [README](README.md), or any Next.js host) and
   set the **same** environment variables in the host's dashboard.
4. Run the migrations against your production Supabase too if you deployed before
   applying them — `npm run doctor` against the production values will tell you.

Stuck? `npm run doctor` is the fastest way to see what's wrong.
