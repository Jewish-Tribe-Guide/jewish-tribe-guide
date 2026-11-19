# Shul watches: the rebuild plan

Written Nov 19, 2026, for the user to approve. Nothing here is built yet.
The rules it builds on are in `docs/how-we-work.md` ("We post schedules,
not highlights" and "Shul watches, in short").

## The rule

1. **Usual times** come from the shul's regular-schedule page, and are
   checked only against that page.
2. **This week's schedule comes in two parts, Shabbos and the
   weekdays**, each only from a source that gives that part whole: the
   shul's calendar (both), or a newsletter's Shabbos or weekday schedule.
   Each part is checked only against our own copy of it, and the newer
   source wins.
3. **A source changes only what it covers.** A day missing from a part it
   gives has no minyan; a part it doesn't give, it says nothing about. We
   copy what it says.
4. **Anything else is ignored**: a highlighted time, an events box, one
   time on a homepage, a newsletter that features one service.
5. **On the site**, usual times and this week's are separate boxes and
   never mix. The this-week box shows the parts we have; with neither,
   there's no this-week box.

## Settled (the user, Nov 19)

- **A shul's calendar is whole.** Seeing its calendar means seeing its
  schedule. Which page is the calendar is confirmed once by an admin (the
  page search suggests it), so an events page is never taken for it. A
  day on the confirmed calendar with nothing has no minyan. The old guess
  (`calendarIsWhole`, which checked the calendar against the usual times)
  goes.
- **Holiday timetables** (Mekor's Tisha B'Av) are their own thing, maybe
  their own box. Not in this rebuild.
- **Shabbos and the weekdays are the parts**, not the whole week, because
  that is how shuls publish (every newsletter read splits them) and how a
  person reads a Shabbos-only email: Shabbos changed, weekdays not
  mentioned. Friday night is Shabbos; Friday morning is a weekday. Never
  "the usual times except this day".

## To find out before building: newsletters

Read Nov 19 in the guide's Gmail: every email from each shul, Oct 15 to
Nov 19, set against the usual times we hold for it. Only one email a week
from each is the schedule; the rest are events and appeals, and say
nothing about services.

- **Society Hill: both parts** (5 of 5 "This Week at Society Hill"
  emails). Friday's TGIShabbat, Shabbos morning, and the Monday Zoom
  Maariv under "Weekly Reminders" near the end, which is all the shul
  has. The end of the email is past Gmail's clip, so the reader must get
  the whole email, not the clipped one. Changes come in prose
  (Thanksgiving week: Friday and Shabbos on Zoom only). The earlier note
  here, that it never gives the Maariv, was wrong: it was read from the
  emails that had filed something, not from the inbox.
- **BZBI: both parts** (5 of 5 "This Week at BZBI"). Shabbos's
  services; "Regular Minyan Times" for every weekday, the same each week;
  the Wednesday 7:00 PM Maariv; and that week's exceptions in prose
  ("Thanksgiving Day … 9:00 AM in person", Rosh Chodesh in person). Some
  weeks have a Friday night service (First Fridays, young professionals),
  most don't.
- **Mekor Habracha: both parts** (4 of 4 Friday newsletters, plus one
  "Corrected" resend). Shabbos's times and a "Weekday Services" table,
  every day, every minyan. The table's date heading can be stale: the
  Nov 6 email's says "November 1 to November 6" over that week's new
  times. So which week it means comes from the email's date, not the
  heading.
- **Kol Tzedek: both parts** (5 of 5 Wednesday emails). Friday night
  and Shabbos morning, which is all the shul has, each marked hybrid,
  online-only or in person. One week says "No Shabbat Services!" on
  Friday: a week with no minyan that night.
- **South Philadelphia Shtiebel: Shabbos only** (5 of 5 "Shabbat …"
  emails). Friday's Kabbalat Shabbat and all of Shabbos (Shacharis,
  Mincha, Maariv), but never the weekday Shacharis the shul has every
  morning. The Monday "This Week at the Shtiebel" email is classes.
- **Sons of Israel:** nothing but the sign-up confirmation (Oct 20).

So four give both parts and one gives only Shabbos. Which parts a newsletter
gives is a fact about that shul's newsletter, confirmed once, as
a calendar page is; not guessed each email.

The Shtiebel's gives all of Shabbos and no weekdays: its Shabbos is
taken, and its website's weekday times stand (decided Nov 19).

## What stays as it is

These work, and have nothing to do with the old approach.

- **Fetching and fingerprinting a page**, and reading it only when it
  changes (`readListingPage`, `watchRunner.ts`). Mikvahs and menus share it.
- **Reading a calendar into dated services** (`calendarFeed.ts`).
- **The AI reader** (`scheduleReader.ts`), reading a source already
  known to give the week.
- **Newsletters arriving by email** (the Gmail script,
  `/api/inbound/newsletter`).
- **Filing to To do**, and "the same suggestion is never filed twice".
- **The page search** (`hoursJob.ts`, `timesPages`), with one fix: it
  prefers a calendar over the homepage. Lower Merion's calendar
  (lowermerionsynagogue.org/calendar, every minyan every day) is one link
  from the homepage we read now.

## What is written fresh

- **`src/lib/shulTimes.ts`, pure, no database or network.** Two questions:
  - `usualFrom(reading, listing)`: what the regular-schedule page changes
    in the usual times.
  - `weekFrom(reading, source, listing)`: the week a whole-week source
    gives, compared with our copy of that week; the newer source wins.
  Never reads the usual times when answering the second. A unit test
  fails if it does.
- **`src/lib/shulTimesRun.ts`**: reads a shul's confirmed pages and its
  newsletter through `shulTimes.ts`, and files one suggestion. The
  newsletter goes through the same code as the website.
- **What the site shows** (`resolveDay` in `schedules.ts`): a week we
  have, that week only; else the usual times as usual. Yom Tov schedules
  a person typed in are left as they are.

What it replaces, deleted once the switch is made: the shul half of
`listingPageRun.ts` (`keepUncovered`, `dropListed`, `yieldToNewsletter`,
`correctOlderWeeks`, `yieldToDated`, `noMinyanWeeks`, `listedServices`,
the events-only path), `shulWeekReading.ts`'s `datedAsWeeks`, and the
one-day additions and "as well as the usual times" cases in `resolveDay`.
Mikvah hours and contact details stay in `listingPageRun.ts`.

## Steps

Each is tested, committed and pushed before the next.

1. **Newsletters:** a month of each shul's, marked by which parts it gives, for the user. Done Nov 19 (above).
2. **Draw the "Their calendar / Their usual times / Their newsletter
   gives Shabbos / weekdays" rows** on a shul's Places page, for the user's OK.
3. **`shulTimes.ts` and its tests**, written from the rule. Each real case
   is a test: Lower Merion's late Maariv on its homepage ignored and its
   calendar's week taken whole; Mekor's homepage Friday ignored; Society
   Hill's week read from the whole email, Monday Maariv included; Mekor's
   week dated by the email, not its stale heading; the Shtiebel's Shabbos email taken with its weekday usual times
   untouched; dated weekday times missing a day as no minyan that day;
   the Little Shul's empty calendar week as no minyan; a newsletter and a calendar disagreeing about the week.
4. **The page search prefers a calendar**, and the confirm rows are built.
5. **A read-only dry run on the 14 live shuls**: what the new code would
   file, beside what the old code filed this week. Shown to the user
   before anything switches.
6. **Switch the nightly run and the newsletter to it**, and change what
   the site shows. Delete the old pieces in the same PR.
7. **Data on live.** Weeks already stored were built under the old rules,
   some with usual times copied in. They're dated, so most pass within a
   week or two. Anything left after that is a live data change, shown to
   the user first.

## Not in this rebuild

- **The paste box, "+ Add" and Add a minyan.** They share the old
  comparison code (`scheduleUpdate.ts`, 925 lines). They stay on it until
  the watch is settled; then decide whether a person pasting one Shabbos's
  times follows the same rule, and move them over, so there is one rule.
- **Mikvah hours.** The same kind of question, separately.
- **How much approving there is.** Left alone, to see if this brings it
  down (about 40 a week for 14 shuls in November).
