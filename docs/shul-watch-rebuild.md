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
4. **Less than a whole part** (a highlighted time, an events box, one
   time on a homepage, Monday and Wednesday only) is looked at only when
   nothing whole covers that part that week. Then it is set against the
   usual times for that part: every usual minyan there at its usual time
   is taken as that part's week; anything else (extra, different or
   missing) goes to the admin. See "Short sources", below.
5. **On the site**, usual times and this week's are separate boxes and
   never mix. The this-week box shows the parts we have; with neither,
   there's no this-week box.

## Settled (the user, Nov 19)

- **A shul's calendar is whole.** Seeing its calendar means seeing its
  schedule. Which page is the calendar is the watch's pick, shown to the
  admin to check ("One pick per part", below), so an events page is never
  taken for it unseen. A day on the calendar with nothing has no minyan,
  within the days it shows and up to its last entry (cases 5 and 6
  below). The old guess
  (`calendarIsWhole`, which checked the calendar against the usual times)
  goes.
- **A newsletter's regular times are that week's** (BZBI's "Regular
  Minyan Times"): the shul said this week that those are the times, so
  each week's email gives a dated weekday part, even when it matches the
  last one. A week's changes written as sentences (Thanksgiving, Rosh
  Chodesh) are applied to it, and the To do item quotes the sentence.
- **Zoom and online-only minyanim are listed, marked Zoom** (BZBI's
  Tue/Wed/Fri, Society Hill's Monday Maariv, Kol Tzedek's online weeks).
- **One To do item per email**, both parts inside; its approval date is
  the listing's "Confirmed by" date.
- A newsletter that skips a week: the usual times show, and Watches says
  "no email this week"; no To do item. Sons of Israel stays watched.
- **Short sources** (the user, Nov 19). A source that gives less than a
  whole part can't say whether a minyan it leaves out is cancelled or
  just not mentioned, and the usual times may be the stale side (a
  shul's winter change is how Lower Merion's calendar got filled from
  old times). So:
  1. **A whole source wins.** If a calendar or newsletter gave that
     part whole for that week, a short source for it is not looked at.
     Mekor's homepage "Fri 4:25" box never reaches the admin: its
     newsletter gives the whole Shabbos every week.
  2. **Otherwise, set against the usual times for that part.** Every
     usual minyan there at its usual time: taken as that part's week.
     Anything else, a minyan missing included: the To do item says what
     is extra, different or missing ("Shabbos morning not mentioned"),
     and the admin decides. Nothing is ignored on a guess that what's
     missing is still on.
  The usual times are compared only to sort these, never to fill a
  week. This comes up for a shul with no calendar and no newsletter for
  that part, or a week the newsletter skips.
- **A highlight never removes a minyan** (the user, Nov 19). The reader
  says what kind of thing each source is (schedule, calendar,
  highlight, event), quoting the heading it sits under, and quotes any
  cancellation ("No Shabbat Services!"). Only a cancellation in words,
  or a whole source, takes a minyan away: in a month of six shuls'
  emails every cancellation was said out loud, none by leaving it out.
  So a highlight that agrees with what we show is ignored, and one with
  a different or extra time goes to the admin, the item saying how it
  was read ("read as a highlight, under 'This Shabbat'"). The step 5 dry
  run is where a shul that cancels by omission would show up.
- **The goal is for the watch to find the answer, the admin to check
  it** (the user, Nov 19: "Admins are really just there to validate,
  not to answer"). So each admin answer on a short source is kept with
  the shul, the source and what was extra or missing, and once a
  source's answers are consistent the watch proposes that answer itself
  and the admin only approves it. Later, a source with "extreme
  consistency" may skip approval. Not built in this rebuild beyond
  keeping the answers.
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
gives is a fact about that shul's newsletter, kept by the watch from
what it has read and shown to the admin with its pick ("One pick per
part", below); not guessed fresh each email.

## One pick per part (the user, Nov 19)

Replaces the one-time admin setup drawn as board 4, which is dropped. A
shul can have several sources for the same thing (Kol Tzedek: four pages
and a newsletter; Sons of Israel: two pages both giving usual times), and
"newer wins" between them means they overwrite each other nightly. So
the watch picks one source for each of usual weekdays, usual Shabbos,
this week's weekdays and this week's Shabbos, ranked: a newsletter, then
a calendar (swapped Nov 19, "Dry run"), then a regular-schedule page, then anything else. Its pick
shows on the shul's Places page and in each To do item; the admin can
change it. The watch answers; the admin checks.

## Cases from live (Nov 19)

Every automated To do item from Nov 5–19, run through the rules above.
Each is a test in step 3.

1. **A short source before the whole one arrives.** Mekor's homepage shows
   next Shabbos from Saturday; its newsletter comes Friday. When a shul's
   newsletter normally gives that part, short sources for it wait until
   the newsletter is late. Kol Tzedek's (Wednesdays) the same.
2. **Notes compared by what they say, not their wording.** Rodeph
   Shalom's Thursday Shacharis was filed four times in a week as
   "Online; until 8:40" / "Online" / "until 8:40; Online" / "Online only".
   Reordered or restated, it is the same note. Kol Tzedek the same.
3. **Several whole sources for one part:** the watch's pick (above). Kol
   Tzedek, BZBI's worship page and newsletter, Mikveh Israel's homepage and
   calendar.
4. **Two pages giving usual times:** the watch's pick. Sons of Israel's
   tefillot page dropped Sunday 8 AM (Nov 12), its homepage added it back
   (Nov 18), both approved.
5. **An empty future week** counts as no minyan only if the calendar has
   something posted after it; otherwise it isn't posted yet. The Little
   Shul and Leyv Ha-Ir each filed "Nov 22–28: no minyan" on Nov 19.
6. **A source is whole only for the days it shows.** Sons of Israel's
   calendar filed "Nov 12–14" and Lower Merion's homepage "Nov 11–13";
   the days outside are not cancelled.
7. **What isn't a minyan isn't counted.** Society Hill's Kristallnacht
   email and BZBI's Hanukkah email each filed an event; it is neither a
   week nor "something extra" for the admin.

The Shtiebel's gives all of Shabbos and no weekdays: its Shabbos is
taken, and its website's weekday times stand (decided Nov 19).

## The listing (approved Nov 19)

Boards 5e–7e on the "Shul schedules" canvas (KYnj9bnY5aY5qg7bp6ty5M).
Built after the watch (step 8 below); the watch goes first.

- **Four boxes, one per part:** This week (weekdays), This Shabbos, Usual
  weekday times, Usual Shabbos times.
- **Each part shown once.** This week's version when we have it, else the
  usual one; the other folds to one line ("Usual weekday times ›").
  At most one weekday and one Shabbos box are open.
- **Order follows the clock:** Shabbos first after the last weekday
  minyan on Friday (Oct 26 rule), weekdays first otherwise. Open boxes
  first, folds under them.
- **Weekdays are a grid**, columns from that shul's own minyanim (Mekor:
  Shacharis · Mincha · Mincha & Maariv). This week's grid keeps past days,
  greyed; today tinted. A row-specific place or note gets a mark (†) and
  one line under the grid.
- **Shabbos is names with times lined up on the right**, under two small
  grey labels, Friday night and Shabbos. Candle lighting and Havdalah in
  grey in the same column. A time set by sunset or candle lighting shows
  this week's clock time, the rule in grey under the name.
- **Each box ends "Confirmed by [shul], [date]"**, the date the admin
  approved it. Which page or email it came from is for the admin, not
  the visitor.
- No "Weekdays"/"Shabbos" part headings, no dates in the group labels.
- Not drawn yet: the desktop listing; "+ Add this week's schedule" needs
  a new home.

**Built Nov 20** (branch `claude/shul-listing`, on top of the watch's
PR 399), checked beside boards 5e–7e on a phone and a computer.
Decided while building, each a change to name:

- **No box waits for this week's.** The usual times stay open until it
  comes, and adding it is each box's own "Update their times" (the
  board's open question, "a new home"). Oct 26 had drawn a "Not on the
  guide yet" box with "Add this week's schedule".
- **No candle lighting or havdalah**, though the board draws them: the
  user, Nov 20, "don't want candle lighting", as on Oct 27, then "remove
  havdalah too".
- **The usual weekday table has a row a day**, Sunday to Friday, as the
  board does; it used to merge days with the same times ("Mon, Thu").
- **This Shabbos is dated, not named** ("Nov 21–22", not "Shabbos
  Vayeitzei"), and This week's box is titled "This week".
- **A sunset time shows the rule until the day itself.** The site knows
  only today's sunset, so on a Tuesday "30 min before sunset" stays the
  rule; the board drew 4:35 PM. As the site has done since Oct 6, and
  kept so (the user, Nov 20: "keep it as is"): no lookup of Shabbos's
  own sunset.
- **A week whose days have all gone by has no box** (on Shabbos before
  havdalah), as before.
- Kept from the site, not the board: Edit under each box (Oct 15), the
  footer's divider, "2 PM" rather than "2:00 PM", a join link under the
  grid naming its minyan ("Join Thu Shacharis on Zoom"), an occasion's
  name under its date in the grid.
- The desktop listing isn't drawn; it shows the same boxes.

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
- **`src/lib/shulTimesRun.ts`**: reads a shul's picked sources and its
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
2. ~~Draw a one-time admin setup of sources~~ (board 4). Dropped Nov 19
   for the watch's own pick ("One pick per part"); how the pick shows on
   Places is drawn before step 4 builds it.
3. **`shulTimes.ts` and its tests**, written from the rule. Each real case
   is a test: Lower Merion's late Maariv on its homepage ignored and its
   calendar's week taken whole; Mekor's homepage Friday ignored; Society
   Hill's week read from the whole email, Monday Maariv included; Mekor's
   week dated by the email, not its stale heading; the Shtiebel's Shabbos email taken with its weekday usual times
   untouched; dated weekday times missing a day as no minyan that day;
   the Little Shul's empty calendar week as no minyan; a newsletter and a calendar disagreeing about the week;
   a short source not looked at when a whole source covers that part
   that week (Mekor's homepage box beside its newsletter); with none, one
   matching every usual minyan taken, and one with anything extra,
   different or missing sent to the admin; and the seven "Cases from
   live", each red against the old code first.
4. **The page search prefers a calendar**, and the watch's pick per part
   is built and shown on Places.
5. **A read-only dry run on the 14 live shuls** (done Nov 19, below): what the new code would
   file, beside what the old code filed this week. Shown to the user
   before anything switches.
6. **Switch the nightly run and the newsletter to it**, and change what
   the site shows. Delete the old pieces in the same PR. Nightly run
   switched Nov 19 ("The switch", below); the newsletter's run is left as
   it is.
7. **Data on live.** Weeks already stored were built under the old rules,
   some with usual times copied in. They're dated, so most pass within a
   week or two. Anything left after that is a live data change, shown to
   the user first.
8. **Build the listing** ("The listing", above). Built Nov 20.

## Dry run (Nov 19)

`scripts/shul-times-dry-run.mts`, reading live only (any write is refused
before it leaves). Thirteen shuls have a watched page; Sons of Israel's and
Lower Merion's sites refuse a request from a laptop (406), though the live
run reads them, so they aren't in it. Newsletters aren't stored: a week on
the listing no website posted stands in for one.

Found, and fixed in the code:

- **A calendar read mid-week shows from today**, not from Sunday. Taken
  as Sunday on, its Thursday–Friday times were a whole weekday week with
  no minyan Sunday to Wednesday.
- **The reader's shape isn't asked of a calendar.** It called Rodeph
  Shalom's Nov 22 week (services beside Torah study) an event, so the
  week was dropped. A calendar is the shul's schedule when it lists the
  usual minyanim (`calendarListsUsual`), else a highlight.
- **The old check failed any shul with a usual minyan set by a zman.**
  The Shtiebel's Kabbalat Shabbat at candle lighting kept its whole
  calendar from counting; such minyanim are left out of the check now.
- **"No week held" isn't "a week with no minyan".** The run must pass a
  held part only when a listing week covers it.

Decided (the user handed both to Claude, Nov 19: "take it from here"):

- **A newsletter first, then a calendar.** BZBI's calendar for Nov 22–28
  lists Sunday and "Tuesday & Wednesday Morning Minyan" once; its
  newsletter, the same evening, lists every weekday, Thanksgiving at
  9:00. With the calendar first the week would have had no minyan four
  days it has one. While the newsletter is due for a part, nothing else
  is filed for it, whole or not, so a part is filed once.
- **A short source giving only the usual times files nothing.** Kesher
  Israel's homepage did, once: a To do item that changed nothing a
  visitor sees.

Still open:

- **The Little Shul's homepage lists its next service** (Dec 5); the old
  run filed "no minyan" for Nov 22–28 from it. The new rules don't read a
  list of dates as a whole calendar.
- **The reader isn't the same twice.** Kol Tzedek's and Kesher Israel's
  weeks came out differently across four runs of the same pages. Pages
  are read only when they change, which limits it.

Lines: the old shul logic is about 720 (431 in `listingPageRun.ts`, 155
`shulWeekReading.ts`, 130 `websiteNotes.ts`); the new is 316 in
`shulTimes.ts`, a third of it comments, plus the run, not written yet
(about 150). About a third fewer, not half.

## The switch: the nightly run (Nov 19)

Built on `claude/next-round`. A shul's page is now read through the rule:

- **`shulPageRead.ts`** reads the page (a calendar a week at a time, any
  other page once over this week and next), turns the reply into
  `SourceRead`s (`fromReading`), and per week weighs them with the shul's
  other pages' last reads and the newsletter's weeks (`weekFrom`). Its
  usual times still go through `compareTimes` as before.
- **`shulWeekFiling.ts`** turns each take or ask into a week schedule for
  its part (`parts`, `whole`, posted by the website), in place of the
  website's earlier week for that part, and writes the admin's lines
  ("Their whole schedule for Shabbos", "At another time: …").
- **Each page's read is kept on its check** (`lastCheck.shulReads`), so the
  shul's other pages are weighed without reading them again
  (`otherShulReads`).
- Deleted: `websiteNotes.ts`, and from `listingPageRun.ts`
  `yieldToNewsletter`, `correctOlderWeeks`, `calendarIsWhole`,
  `readCalendarWeeks`, `noMinyanWeeks`, `listedServices` and the rest of
  the old week logic: about 630 lines out, 507 in (`shulPageRead.ts`,
  `shulWeekFiling.ts`).

Changes to earlier decisions, made under "take it from here":

- **The website no longer corrects an older newsletter week** (Nov 11's
  `correctOlderWeeks`). A newsletter's week wins its part, and a page
  that disagrees with it later in the week files nothing, not even a To
  do item. Asked Nov 20 whether such a late change should go to To do;
  the user: "No, newsletter wins".
- **A time the reader can't name ("other") is left out.** Rodeph
  Shalom's potluck-adjacent 6pm, Mikveh Israel's pictured 6pm.
- **The Little Shul's list of dates isn't read as its calendar** (open
  above, now settled this way).
- **The newsletter's run is unchanged.** Its weeks carry no `parts`; such a
  week speaks for a part it gives times in, or whose every day it spans
  (the Shtiebel's Friday-to-Saturday week is Shabbos only).

Found by the dry run on this code (Nov 19), and fixed:

- **Two sources of one rank take turns.** Kol Tzedek's homepage carries
  the same calendar feed as its calendar page, and the reader gave
  Shabbos morning's end two ways ("until 10:45 AM", "until 12:30 PM").
  The newest read won, so whichever page ran last filed. Now, if any
  source of the top rank gives the week we hold, nothing is filed.
- **A whole week that is only the usual times still goes to the admin**,
  with the line "The same as their usual times". Nov 19 it filed nothing;
  the user, Nov 20: "let's actually have admin approval for it even if it
  matches. If we see that it's accurate then that could be the first
  exception down the road." A short source (a homepage listing the usual
  times) still files nothing: it doesn't say anything about this week.
- **Notes are compared by their words.** The reader gave Kol Tzedek's
  Shabbos morning note three ways from one feed ("In-Person" / "in
  person", "Torah Study" with and without "with Rabbi Mó", "Shacharit &"
  in front). A note using only words the held one has says nothing new; a
  new word ("Not", a new end time) is a change.
- **On live, only BZBI, Mekor and Society Hill have newsletter weeks.**
  Kol Tzedek's newsletter has sent nothing to the watch since Oct 8, and
  the Shtiebel's one email was rejected, so their calendars speak for
  their weeks. That is right for what the site has; if their newsletters
  are meant to be linked, that's a setup job, not code.

With these, the dry run on Nov 19 filed four items for the week of
Nov 22 across 13 shuls, each a real change: the Shtiebel's Shabbos (5:00
PM Kabbalat Shabbat where the listing has candle lighting, a 4:00 Mincha),
and Mikveh Israel's Thanksgiving Shacharis at 8:15 and its Friday
Kabbalat Shabbat. Since Nov 20, a week matching the usual times goes to
To do too (the Shtiebel's weekdays), marked as usual. The old watch filed 17 items since Nov 15.

Not yet: step 7's live data. Step 8 built Nov 20 ("The listing").

## Not in this rebuild

- **The paste box, "+ Add" and Add a minyan.** They share the old
  comparison code (`scheduleUpdate.ts`, 925 lines). They stay on it until
  the watch is settled; then decide whether a person pasting one Shabbos's
  times follows the same rule, and move them over, so there is one rule.
- **Mikvah hours.** The same kind of question, separately.
- **How much approving there is.** Left alone, to see if this brings it
  down (about 40 a week for 14 shuls in November).
