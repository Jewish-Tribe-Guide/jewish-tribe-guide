# Shul watches: the rebuild plan

Written Nov 19, 2026, for the user to approve. Nothing here is built yet.
The rules it builds on are in `docs/how-we-work.md` ("We post schedules,
not highlights" and "Shul watches, in short").

## The rule, in four lines

1. **Usual times** come from the shul's regular-schedule page, and are
   checked only against that page.
2. **A day's schedule** comes only from a source that gives that whole
   day: a calendar, a newsletter's schedule, a holiday timetable. It is
   checked only against our own copy of that day, and the newer source wins.
3. **Anything else is ignored**: a highlighted time, an events box, one
   time on a homepage.
4. **On the site**, a day shows its schedule if we have one, and otherwise
   the usual times, labelled as usual. No schedule, no "this week" box.

## To confirm first

These came out of writing the plan down. Each changes what gets built.

- **The unit is a day, not a week.** Society Hill's newsletter gives the
  whole Shabbos (Friday night and Saturday) and nothing for the weekdays;
  Mekor's Tisha B'Av timetable gives two days. Both are whole for the days
  they give, the way you agreed for Tisha B'Av. So I'd say a source counts
  for each day it gives in full, and the other days of that week show the
  usual times. Lower Merion's late Maariv and Mekor's homepage Friday
  Mincha still don't count: each is one time on a day that has others.
  *Recommended: yes, a whole day counts.*
- **Which page is a shul's calendar is decided once, not guessed each
  night.** Today the code decides a calendar is "whole" by checking that
  it lists the usual times (`calendarIsWhole`), which is the usual-times
  comparison again, and it guesses wrong in both directions (the Little
  Shul, Leyv Ha-Ir). Instead: the page search suggests each shul's
  calendar page and regular-schedule page, and an admin confirms each once
  on the shul's Places page ("Their calendar", "Their usual times"). A
  confirmed calendar is whole: a day on it with nothing has no minyan.
  This needs a small drawing before it's built.
  *Recommended: yes, an admin confirms once.*

## What stays as it is

These work, and have nothing to do with the old approach.

- **Fetching and fingerprinting a page**, and reading it only when it
  changes (`readListingPage`, `watchRunner.ts`). Mikvahs and menus share it.
- **Reading a calendar into dated services** (`calendarFeed.ts`).
- **The AI reader** (`scheduleReader.ts`). It already says whether a
  message lists every minyan for the days it covers (`complete`). At most
  its prompt changes, to say which days it gives in full.
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
  - `daysFrom(reading, source, listing)`: the whole days a source gives,
    each compared with our copy of that day; the newer source wins a day.
  Never reads the usual times when answering the second. A unit test
  fails if it does.
- **`src/lib/shulTimesRun.ts`**: reads a shul's confirmed pages and its
  newsletter through `shulTimes.ts`, and files one suggestion. The
  newsletter goes through the same code as the website.
- **What the site shows for a day** (`resolveDay` in `schedules.ts`):
  the day's schedule if there is one, else the usual times as usual. Yom
  Tov schedules a person typed in are already whole for their days, so
  they follow the same rule.

What it replaces, deleted once the switch is made: the shul half of
`listingPageRun.ts` (`keepUncovered`, `dropListed`, `yieldToNewsletter`,
`correctOlderWeeks`, `yieldToDated`, `noMinyanWeeks`, `listedServices`,
the events-only path), `shulWeekReading.ts`'s `datedAsWeeks`, and the
one-day additions and "as well as the usual times" cases in `resolveDay`.
Mikvah hours and contact details stay in `listingPageRun.ts`.

## Steps

Each is tested, committed and pushed before the next.

1. **Confirm the two points above.**
2. **Draw the "Their calendar / Their usual times" rows** on a shul's
   Places page, for your OK.
3. **`shulTimes.ts` and its tests**, written from the four-line rule.
   Every case below is a test: Lower Merion's late Maariv ignored, Mekor's
   homepage Friday ignored, Society Hill's Shabbos newsletter counting for
   Friday and Saturday only, the Little Shul's empty calendar week as no
   minyan, a newsletter and a calendar disagreeing on one day.
4. **The page search prefers a calendar**, and the confirm rows are built.
5. **A read-only dry run on the 14 live shuls**: what the new code would
   file, beside what the old code filed this week. Shown to you before
   anything switches.
6. **Switch the nightly run and the newsletter to it**, and change what
   the site shows for a day. Then delete the old pieces in the same PR.
7. **Data on live.** Weeks already stored were built under the old rules,
   some with usual times copied in. They're dated, so most pass within a
   week or two. Anything left after that is a live data change, shown to
   you first.

## Not in this rebuild

- **The paste box, "+ Add" and Add a minyan.** They share the old
  comparison code (`scheduleUpdate.ts`, 925 lines). They stay on it until
  the watch is settled; then decide whether a person pasting one Shabbos's
  times follows the same rule, and move them over, so there is one rule.
- **Mikvah hours.** The same kind of question, separately.
- **How much approving there is.** Left alone, to see if this brings it
  down (about 40 a week for 14 shuls in November).
