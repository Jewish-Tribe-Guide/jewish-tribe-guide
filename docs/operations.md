# Running the site

What keeps watch over the live site, and what to do when it speaks up.
Checked end to end on Nov 22, 2026 (the operations sweep). How to get
data back is in `docs/backups.md`.

## What watches what

| If this goes wrong | What notices | How you hear |
| --- | --- | --- |
| The whole site is down | UptimeRobot, every 5 minutes, on `/philly` | Email to the Jewish Tribe Guide Gmail |
| A nightly job fails or doesn't run | The nightly email (09:45 UTC) lists every job's run | The nightly email |
| The nightly email itself doesn't run | Sentry cron monitor `job-nightly-email` | Email from Sentry |
| A visitor hits an error | Sentry | `npm run sentry:check`; Sentry's own alert emails |
| Sentry is over its quota and dropping errors | `npm run sentry:check` fails with "dropped N event(s)" | Only when someone runs it |
| The database is lost or damaged | Supabase's backups, and our own copy (`npm run backup -- --prod`) | — |
| The certificate expires | Vercel renews it (Let's Encrypt; good to Jan 5, 2027 when checked) | — |
| The domain expires | Namecheap, registered to Jul 24, 2027 | Namecheap's renewal emails |

## Found and fixed Nov 22

- **Sentry was blind from Nov 13 to Nov 22.** The map's security-policy
  reports used up the monthly error quota, so real errors were dropped
  too, and `sentry:check` printed a green tick. Fixed in PR 432: the
  policy allows what Google Maps loads, and the check says when events
  are being dropped. The quota resets about Nov 30; until then the check
  fails, as it should.
- **The nightly email's heartbeat called every good run a timeout.** The
  job ran and sent, but its "finished" check-in was lost when Vercel
  froze the function (`cronHeartbeat.ts` now waits for it to be sent).
  A Sentry "missed" or "timed out" email about it before this fix
  deployed was this, not a real failure.

## Only you can do these (a few minutes each)

1. **Supabase → live project → Database → Backups.** Note the plan, how
   many days of backups are listed, and whether Point in Time Recovery is
   on. If no backups are listed, our own copy is the only one. Tell
   Claude, so `docs/backups.md` can say it.
2. **Vercel → Production environment variables.** Check the Turnstile
   secret and the two Upstash ones are set. Without them, contributions
   and the AI readers refuse on live, on purpose.
3. **Namecheap.** Check auto-renew is on for phillyjewishguide.com.
4. **UptimeRobot.** Check the monitor is still green, and that its
   emails reach an inbox someone reads.
5. **Sentry → Alerts.** Check a new issue sends an email to someone.

## Habits

- **Weekly:** `npm run backup -- --prod` (read only, a couple of
  minutes). The only live copy so far is Nov 21.
- **Before calling work done:** `npm run sentry:check`.
- **When a community is made visible:** add an UptimeRobot monitor for
  `/<slug>`.
