# Bring this to your community

This app is a **template**. Standing up a version for your community is mostly a
matter of _providing information_ — not writing code. This page is the intake:
fill in Part 1, decide on Part 2, and gather Part 3, then hand the whole thing to
a developer (or an AI assistant like Claude Code) who will wire it up using
[`README.md`](README.md). If you can fill this out, someone can build your site.

> **The short version:** a working, branded, *empty* directory for your
> community needs only the **bold-Required** items below — realistically an
> afternoon once you have a Supabase account and a Google Maps key. Everything
> else adds content or optional features.

---

## Part 1 — About your community (branding & decisions)

Copy this block and fill in the blanks. Every field maps to one value in
`src/community.config.ts`.

```
Community name (full):            e.g. "Baltimore Jewish Community"
Short name (~12 chars, app icon): e.g. "Baltimore JC"
Tagline (one line):               e.g. "Guide for residents & visitors"
Mission (one sentence):           e.g. "A guide to Jewish Baltimore — kosher food,
                                       shuls, mikvaos, and Shabbos times."
Region label:                     e.g. "Baltimore"
Map center (lat, lng):            e.g. 39.3690, -76.7150   (see tip below)
Timezone (IANA):                  e.g. "America/New_York"  (America/Chicago, etc.)
Brand color (hex):                e.g. "#1d4ed8"
Background color (hex):           e.g. "#f8fafc"
Logo:                             an SVG mark (or send us a PNG/idea to trace)
Favicon:                          a .ico / square image for the browser tab
```

**Which feature modules do you want?** These are hand-built cards/flows —
_separate_ from the directory categories you choose in Part 2. Turn any off if
they don't fit:

```
Eruv information ........ yes / no
Zmanim & Shabbos times .. yes / no
Hospital patient support . yes / no   ← turn OFF for a general community
  ├ "Jewish Medical Resources" (per-hospital Jewish life)
  ├ "Patient & Family Support" request flow
  └ "Volunteer for Patients" flow
```

> **Tip — map center:** search your neighborhood on Google Maps, right-click the
> middle of it, and click the lat/lng at the top of the menu to copy it.

**Which UI options do you want?** The base app is the same for everyone; a
`ui` block in `src/community.config.ts` turns individual affordances on/off (all
default on — flip to `false` to remove). Pick per row:

```
Public contributions (ui.contributions)
  ├ Add buttons ............... yes / no
  ├ Edit (per listing) ........ yes / no
  ├ Report (per listing) ...... yes / no
  └ Suggest a new category .... yes / no    ← all off = curated, admin-only
Search bars (ui.search)
  ├ Home / landing search ..... yes / no
  ├ Category directory search . yes / no
  └ Map search ................ yes / no
Map & discovery (ui.map)
  ├ Map at all (card + screen)  yes / no    ← off = no map anywhere
  ├ Live GPS tracking ......... yes / no
  └ "Nearby" list ............. yes / no
Upvotes (ui.upvotes) .......... yes / no
```

Turning a contribution off removes its button **and** makes the server reject
that action — so "curated" really is curated, not just hidden buttons.

---

## Part 2 — Choose your directory categories

The directory is built from **categories** — the tabs of listings on the home
screen. Keep the ones you want, drop the rest, or add your own. **Six come
pre-built:**

| Category | What each listing holds | Keep it? |
|---|---|---|
| **Grocery Stores** | name · address · phone · kosher? · kosher items | ☐ |
| **Food Establishments** | name · address · phone · type (restaurant / bakery-café / ice cream) · kosher cert | ☐ |
| **Hotels** | name · address · phone · Shabbos-friendly? · shuttle? | ☐ |
| **Mikvah** | name · address · hours · tevillah / keilim | ☐ |
| **WhatsApp Groups** | name · description · invite link | ☐ |
| **Synagogues** | name · address · denomination · minyan/davening times | ☐ |

All six live in **one file — `src/data/categories.js`** — and that's the single
place to choose:

- **Keep all, some, or none.** Delete any category block you don't want from
  `src/data/categories.js`. Everything follows it: the card, its starter
  listings, tags, and upvotes are all skipped automatically, and Synagogues drop
  cleanly too (no leftover empty card). Any subset works with `npm run setup` —
  so "restaurants but not groceries" is totally fine.
- **Reorder or tweak.** `sort_order` sets the card order; edit a category's
  label, emoji icon, or its fields right there.
- **Add your own.** Want _Schools_, _Gemachs_, or _Shiurim_? Copy a block, give
  it a unique id, a name, an icon, and its fields. Communities can also add
  categories **after launch** through the in-app "Suggest a new category" flow
  (an admin approves it at `/admin`).

### Starting content (optional — you can launch empty)

For each category you keep, either provide a starting list or launch empty:

- **Start empty and crowdsource (fastest).** Ship with an empty directory; your
  community fills it in through the built-in **submit → review → approve** flow.
  Nothing to gather up front.
- **Seed a starting set from a spreadsheet.** Hand over a **CSV per category** —
  a header row with `name`, `address`, `phone`, and columns matching the fields
  above (booleans accept yes/no; tag lists split on `;`). Your builder loads each
  with one command — addresses are geocoded automatically:

  ```bash
  npm run import -- shuls.csv --category synagogue
  npm run import -- food.csv  --category restaurant --dry-run   # preview first
  ```

  Add `--status pending` to route the rows through the moderation queue instead
  of publishing them straight away.

Two feature modules (Part 1) have their own small data, only if you turn them on:

```
Eruv(im):  name · area covered · status-page URL      (if Eruv is on)
Hospitals: name · coordinates · timezone              (if patient support is on)
```

---

## Part 3 — Accounts & credentials (someone has to create these)

These are external services. The **account owner must create them** (they can't
be handed to you second-hand), but each is free to start. Give the resulting
keys to whoever builds the site — they go in a `.env.local` file (see
[`.env.example`](.env.example) for the exact names and where each is found).
**[SETUP.md](SETUP.md)** walks through creating each account click-by-click, and
**`npm run doctor`** checks that everything is wired up.

### Required — the site won't function without these
| What | Why | Where |
|---|---|---|
| **Supabase project** (URL + anon key + service-role key) | The directory database + submit/approve pipeline | supabase.com → new project → Settings → API |
| **Google Maps API key** | Address autocomplete + the interactive map (enable **Maps JavaScript API** + **Places API**) | console.cloud.google.com |
| **Admin email(s)** | Who can log in to `/admin` to approve submissions | you decide |
| **A host + domain** | Where it lives (one-click Vercel deploy in the README) | vercel.com |

### Conditional — only if you turn the matching feature on
| What | Needed when | Why |
|---|---|---|
| **Resend account + verified domain** | You want email notifications/confirmations | Emails to submitters + admins |

### Recommended / optional — safe to skip at first
| What | Why |
|---|---|
| **Upstash Redis** | Durable rate-limiting under real traffic (works without it in dev) |
| **Cloudflare Turnstile** | CAPTCHA on public forms (inert until set) |
| **Server geocoding key / cron secret** | Better geocoding + securing the hours-sync job |

---

## Part 4 — Handing it off

Once Part 1 is filled in, Part 2 is decided, and Part 3 is gathered, give this
document (plus your logo and any content spreadsheet) to your developer or an AI
assistant with something like:

> "Adapt this repo for my community using the filled-in `NEW-COMMUNITY.md`."

They will, following [`README.md`](README.md): edit `src/community.config.ts`,
drop in your logo/favicon, set feature flags, load your content (or leave it
empty), apply the database schema, run `npm run setup`, and deploy.

**Minimum to go live:** Part 1 (branding) + a Supabase project + a Google Maps
key + an admin email + a host. Start empty, and grow the directory from there.
