'use client'

import { useContext, useState, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { formatDays, isMinyanim, signUpAction, TEFILLAH_LABELS, TEFILLAH_ORDER, type Minyan } from '@/lib/davening'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { anchorKey, resolveAnchorTime, type AnchorTimes } from '@/lib/useZmanAnchors'
import { dateText, readSchedules, regularMinyanim, scheduleDayText, shabbosComesFirst, thisWeeksDays, type DayPosting, type SpecialSchedule } from '@/lib/schedules'
import { isShabbosRow } from '@/lib/minyanText'
import { clockMinutes, noteText, ruleLinesToday, shabbosList, timeText, weekdayTable, weekGrid, type ShabbosLine, type WeekGrid } from '@/lib/weekTable'
import { DAY_KEYS, type DayKey } from '@/lib/hours'
import { boxDate } from '@/lib/listingView'
import { THIS_WEEK_SECTION } from '@/lib/boxDates'
import { resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { useContributions } from '@/lib/communityContext'
import { ChevronRightIcon, PlusIcon } from '@/components/icons'
import AddScheduleBox from './AddScheduleBox'
import UpdateTimesBox from './UpdateTimesBox'
import { TellAboutContext } from './tellAbout'
import DaveningTimes from './DaveningTimes'
import { Card } from './listingParts'
import FreshnessFooter from './FreshnessFooter'
import { SignUpBox, SignUpMark } from './SignUp'
import { JoinLink } from './JoinLink'
import { useTappedMinyan } from './TappedMinyan'
import type { MinyanBox } from '@/lib/minyanimBox'

/** A shul's main thing (agreed Oct 6): its usual times as two boxes, “Usual
 *  weekday times” (one small table, today marked) and “Usual Shabbos times”
 *  (in the order Shabbos happens), each written as the shul gives them, with
 *  this week's clock time in grey where the guide knows it. Once the week's
 *  last weekday minyan has started, through Shabbos, Shabbos comes first
 *  (shabbosComesFirst). See weekTable.ts.
 *
 *  Over a Yom Tov (step 4, agreed Oct 1): the shul's special schedule in its
 *  own box on top while it applies, the usual times folded under it; or,
 *  where it hasn't posted one, a box saying so, with “Know their Sukkos
 *  times? Add them”.
 *
 *  “Update their times” (agreed Oct 1): paste the shul's new schedule or this
 *  Shabbos's times, or add one time, and see the result to send
 *  (UpdateTimesBox). */
export default function DaveningCard({
  item,
  minyanim,
  schedules: rawSchedules,
  category,
  onEditBox,
}: {
  item: DirectoryResource
  minyanim: unknown
  /** The shul's special schedules, stored beside its times. */
  schedules?: unknown
  category?: CategoryConfig
  /** Edit under a usual box (Oct 10): that box's times alone, in a plain
   *  editor (BoxEditSheet). Without it, "Update their times" as before. */
  onEditBox?: (box: MinyanBox, title: string, weeks?: readonly string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [sent, setSent] = useState(false)
  // Which box "Update their times" was opened from, and where it said
  // thanks: it opens in place, in the box that asked.
  const [updatingIn, setUpdatingIn] = useState<string | null>(null)
  const [updated, setUpdated] = useState<{ in: string; what: 'sent' | 'confirmed' } | null>(null)
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({})
  const tellAbout = useContext(TellAboutContext)
  // Opened from a minyan that only runs when enough sign up: the box at the
  // top already says where (TappedMinyan), so it isn't said again here.
  const tapped = useTappedMinyan(item.id)?.minyanId
  const tappedRow = tapped && isMinyanim(minyanim) ? minyanim.find((m) => m.id === tapped) : undefined
  const schedule = useMinyanSchedule(null, [item])
  const canAdd = useContributions().edit && (!category || resolveCapabilities(category.capabilities).edit)

  // Whose times today's and tomorrow's are: a special schedule's, or the
  // regular ones on a festival day with none posted.
  const schedules = readSchedules(rawSchedules)
  const posting: DayPosting[] = schedule ? [schedule.today, schedule.tomorrow].map((d) => schedule.posting[item.id]?.[d.date] ?? { kind: 'regular' }) : []
  // "This week's schedule" (the user, Oct 20: one schedule for a week):
  // the weeks the shul sent out or its website gives, and this week's
  // one-day additions, day by day (thisWeeksDays).
  // From the week's Sunday: its grid keeps the days gone by, greyed (board
  // 5e, Nov 19).
  const thisWeek = schedule ? thisWeeksDays(schedules, schedule.today.date, { shabbosOver: schedule.shabbosOver, regular: regularMinyanim(minyanim), withPast: true }) : { days: [], posts: [], none: null, range: null }
  const inThisWeek = new Set(thisWeek.days.flatMap((d) => d.minyanim.map((m) => m.from)))
  // Anything else today or tomorrow (a Yom Tov schedule) has its own box.
  const specialSchedule = posting
    .filter((p): p is Extract<DayPosting, { kind: 'schedule' }> => p.kind === 'schedule')
    .map((p) => schedules.find((s) => s.name === p.name))
    .find((s) => s && s.kind !== 'week' && !inThisWeek.has(s))
  const notPosted = posting.find((p): p is Extract<DayPosting, { kind: 'not-posted' }> => p.kind === 'not-posted')

  // Older rows keep their times as one line of text.
  if (typeof minyanim === 'string') {
    return (
      <Card title="Davening times" testId="listing-davening" footer={<FreshnessFooter resourceId={item.id} source={item.confirmedFrom} by={item.confirmedBy} confirmedAt={item.confirmedAt} subject="Times" />}>
        <DaveningTimes legacyText={minyanim} />
      </Card>
    )
  }

  const rows = regularMinyanim(minyanim)
  // Every minyan here only runs when enough sign up: the box speaks for the
  // place, with no "other times" to call regular.
  const allSignUp = rows.length > 0 && rows.every((m) => m.signUp)
  const season = schedule?.season ?? null
  const anchors = schedule?.anchors[anchorKey(item.geo)]
  // A summer/winter pair goes by its zman (seasonPairs.ts).
  const week = weekdayTable(rows, season, anchors, { perDay: true })
  const shab = shabbosList(rows, season, anchors)
  const today = schedule?.todayKey ?? null

  // This week's schedule, when the shul sends one out (Oct 6): what it sent
  // for this week, or a box waiting for it.
  const todayDate = schedule?.today.date ?? null
  // The week it shows that Edit opens: the newsletter's, if there's one;
  // or their calendar's week with no minyan in it (SpecialSchedule.whole).
  const post = thisWeek.posts[0] ?? thisWeek.none ?? undefined
  // A week's minyanim as the week gives them: never with the usual
  // minyan's sign-up group or join link (the user, Nov 5: "no borrowing").
  const weekRows = thisWeek.days.map((d) => ({
    ...d,
    rows: d.minyanim.map(({ minyan: { on: _on, ...m } }): Minyan => {
      void _on
      return { ...m, days: [weekdayOf(d.date)] }
    }),
  }))
  // The weekdays a week replaces the usual times on, gone by or not (not
  // an addition's).
  const postDays = new Set(thisWeek.posts.flatMap((p) => p.minyanim.flatMap((m) => m.on.map((d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? weekdayOf(d) : d)))))

  // This week's own times in two boxes, split as the usual ones are
  // (isShabbosRow; drawn Oct 26): its weekdays, through Friday's Shacharis,
  // and This Shabbos, from Friday night.
  const daysOf = (shabbos: boolean) =>
    weekRows
      .map((d) => {
        const keep = d.rows.map((m) => isShabbosRow(m) === shabbos)
        return { ...d, rows: d.rows.filter((_, i) => keep[i]), minyanim: d.minyanim.filter((_, i) => keep[i]) }
      })
      .filter((d) => d.rows.length > 0)
  const weekdayDays = daysOf(false)
  const shabbosDays = daysOf(true)

  // Shabbos first once the week's last weekday minyan has started (the
  // user, Oct 26): on a Friday morning the Shacharis still ahead stays on
  // top. Each weekday's times are this week's where it gives that day's,
  // else the usual ones.
  const startsOn = (date: string) => {
    const weekday = weekdayOf(date)
    const given = weekdayDays.find((d) => d.date === date)?.rows
    const whole = [...thisWeek.posts, ...(thisWeek.none ? [thisWeek.none] : [])].some((p) => p.whole && p.from <= date && date <= p.to)
    const day = given ?? (whole ? [] : rows.filter((m) => (!m.season || m.season === season) && m.days.includes(weekday) && !isShabbosRow({ ...m, days: [weekday] })))
    return day.map((m) => clockMinutes(m.time) ?? clockMinutes(resolveAnchorTime(m, anchors) ?? '') ?? 18 * 60)
  }
  const shabbosFirst = !!schedule && !!todayDate && shabbosComesFirst(todayDate, schedule.nowMinutes, schedule.shabbosOver, startsOn)

  // The usual times a schedule replaces fold to one line under it.
  const foldReason = (key: 'week' | 'shabbos') =>
    specialSchedule?.mode === 'replace'
      ? `Not now: the ${specialSchedule.name} times above replace them`
      : // Shabbos's usual times fold only for a week with Shabbos's own: a
        // newsletter ending Friday night (Mekor, Oct 18) left Shabbos
        // morning's usual time folded away, greyed as not this week's.
        // Their whole week (their calendar) replaces both, a day it has
        // nothing for included.
        thisWeek.none
        ? 'Not this week: no minyan this week'
        : post && (post.whole || (key === 'shabbos' ? postDays.has('sat') : ['sun', 'mon', 'tue', 'wed', 'thu'].some((d) => postDays.has(d as DayKey))))
          ? 'Not this week: this week’s schedule replaces them'
          : null

  // On a category page, the regular "+ Add" box about the shul (Oct 6): one
  // way to send a schedule everywhere, a photo or PDF or pasted email, its
  // week shown to check before sending. Without one (the Map), in place.
  const open = (key: string) => (tellAbout ? tellAbout(item, undefined, { times: true }) : setUpdatingIn(key))
  /** "Update their times", opened in the box `key`, or its thanks. */
  const updateIn = (key: string) => {
    if (!canAdd) return null
    if (updated?.in === key)
      return (
        <p role="status" className="mt-2 text-[13.5px] font-semibold text-emerald-700">
          {updated.what === 'sent' ? 'Thanks! An admin checks them before everyone sees them.' : 'Thanks! Marked confirmed.'}
        </p>
      )
    if (updatingIn !== key) return null
    return (
      <div className="mt-2">
        <UpdateTimesBox
          item={item}
          minyanim={rows}
          onSent={(what) => {
            setUpdated({ in: key, what })
            setUpdatingIn(null)
          }}
          onClose={() => setUpdatingIn(null)}
        />
      </div>
    )
  }
  /** A box's own date (agreed Oct 6, migration 072) and, beside it, the way
   *  to send new times: "Confirmed Sep 29 · Update their times". */
  const foot = (key: string, section: 'weekday' | 'shabbos') =>
    onEditBox ? (
      <FreshnessFooter
        resourceId={item.id}
        {...boxDate(item, section)}
        section={section}
        onEdit={() => onEditBox(section, section === 'weekday' ? 'Usual weekday times' : 'Usual Shabbos times')}
      />
    ) : (
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <FreshnessFooter resourceId={item.id} {...boxDate(item, section)} section={section} />
        {canAdd && updatingIn !== key && updated?.in !== key && (
          <button type="button" onClick={() => open(key)} className="cursor-pointer text-[13.5px] font-bold text-primary hover:underline">
            Update their times
          </button>
        )}
      </div>
    )

  /** A usual box this week's own times replace: one line, its name and
   *  season and a chevron (board 5e, Nov 19), under the open boxes; tapped,
   *  it opens there. `open` when nothing replaces it. */
  const place = (key: 'week' | 'shabbos', title: string, seasonal: boolean, body: ReactNode): { open?: ReactNode; fold?: ReactNode } => {
    if (!foldReason(key)) return { open: body }
    if (unfolded[key]) return { fold: body }
    return {
      fold: (
        <button
          key={key}
          type="button"
          onClick={() => setUnfolded((u) => ({ ...u, [key]: true }))}
          aria-expanded={false}
          className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left"
          data-testid="davening-folded"
        >
          <span className="text-base font-extrabold text-slate-900">{title}</span>
          <span className="flex items-center gap-2.5 text-[14.5px] font-semibold text-slate-600">
            {seasonal && season ? season.charAt(0).toUpperCase() + season.slice(1) : null}
            <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
          </span>
        </button>
      ),
    }
  }

  /** A box opened though its times are replaced: its top, the title and the
   *  line saying why, folds it again, as the same top folded opened it (the
   *  user, Oct 19: once opened, it stayed open; then only its arrow closed
   *  it, though anywhere on it had opened it). Null when nothing replaces it. */
  const foldBack = (key: 'week' | 'shabbos', title: string) => {
    const reason = foldReason(key)
    if (!reason) return null
    return (
      <button
        type="button"
        onClick={() => setUnfolded((u) => ({ ...u, [key]: false }))}
        aria-expanded={true}
        aria-label={`Fold ${title}`}
        className="mb-1.5 flex w-full cursor-pointer items-center justify-between gap-3 pt-2.5 text-left"
        data-testid="davening-fold"
      >
        <span>
          <span className="block text-base font-extrabold text-slate-900">{title}</span>
          <span className="mt-0.5 block text-[13.5px] text-muted" data-testid="davening-fold-reason">
            {reason}
          </span>
        </span>
        <ChevronRightIcon className="h-5 w-5 shrink-0 -rotate-90 text-slate-400" />
      </button>
    )
  }
  const weekFold = foldBack('week', 'Usual weekday times')
  const shabbosFold = foldBack('shabbos', 'Usual Shabbos times')

  const weekBox = week
    ? place(
        'week',
        'Usual weekday times',
        rows.some((m) => m.season && !isShabbosRow(m)),
        <Card key="week" title={weekFold ? undefined : 'Usual weekday times'} testId="davening-weekday" footer={foot('week', 'weekday')} muted={!!weekFold}>
          {weekFold}
          <WeekTable table={week} today={today} marks={!week.everySignUp} />
          <Notes
            lines={[
              ...ruleLinesToday(week.rules, today, anchors),
              ...week.notes,
              week.otherSeason,
            ]}
          />
          {/* A cell holds times: the way to join one from home goes under
              the table, naming it. */}
          {week.joins.map((m) => (
            <JoinLink key={m.id} link={m.joinLink} what={`${formatDays(m.days.filter((d) => d !== 'sat'))} ${TEFILLAH_LABELS[m.tefillah]}`.trim()} className="mt-2 block text-[14px]" />
          ))}
          {!allSignUp && signUpBoxes(week.signUps, { section: week.everySignUp ? 'All weekday times' : undefined, tapped: tappedRow })}
          {updateIn('week')}
        </Card>,
      )
    : // No weekday times: nothing asks for them (Nov 19, the user: "can't
      // we just not nag"). A place may have none, a minyan that meets
      // only on Shabbos, and a shul's are added the way anything is: Edit
      // or "+ Add". Shabbos below, the same.
      {}

  const shabbosBox = shab
    ? place(
        'shabbos',
        'Usual Shabbos times',
        rows.some((m) => m.season && isShabbosRow(m)),
        <Card key="shabbos" title={shabbosFold ? undefined : 'Usual Shabbos times'} testId="davening-shabbos" footer={foot('shabbos-usual', 'shabbos')} muted={!!shabbosFold}>
          {shabbosFold}
          <ShabbosRows items={usualShabbosItems(shab.lines, anchors, today)} anchors={anchors} marks={!shab.lines.every((l) => l.row.signUp)} />
          <Notes lines={[shab.otherSeason]} />
          {!allSignUp &&
            signUpBoxes([...new Set(shab.lines.filter((l) => l.row.signUp).map((l) => l.row))], {
              section: shab.lines.every((l) => l.row.signUp) ? 'All Shabbos times' : undefined,
              tapped: tappedRow,
            })}
          {updateIn('shabbos-usual')}
        </Card>,
      )
    : {}

  // The week's own line, the same as every box's (the user, Oct 19): who
  // confirmed it and when, Edit at its end, opening its own times. The
  // approval that put it up dated the listing, so that date, unless the
  // week was posted later than any confirmation (an older row).
  // A week of only dated services (a newsletter's "Shabbat Oct 24"), no
  // week posted: the first of them, or the box had no line at all (BZBI,
  // the user, Oct 22).
  /** A box of this week's own line: `fp` is the post its times are from;
   *  its Edit opens that and every other post the box shows a time from
   *  (Mekor's Shabbos 9:15 PM, from a second post, couldn't be found to
   *  change; the user, Nov 10). */
  const postFootFor = (fp: SpecialSchedule | undefined, key: string, days: readonly { minyanim: readonly { from: SpecialSchedule }[] }[] = []) => {
    if (!fp) return undefined
    // When it was posted, or the date the shul's website last gave the
    // week's times (THIS_WEEK_SECTION) or a person the whole place, if
    // later: never a date a check gave the whole listing (boxDates.ts).
    const weekDate = boxDate(item, THIS_WEEK_SECTION)
    const postedLater = !weekDate.confirmedAt || (!!fp.postedAt && fp.postedAt > weekDate.confirmedAt)
    // Read off the shul's website, it says so, as an agreeing read does: an
    // approval dates the whole listing, which no box goes by (Shtiebel's
    // week said only "last checked", the user, Oct 27).
    const postedFrom = fp.postedBy === 'website' && fp.postedAt ? { source: { from: item.name, at: fp.postedAt } } : {}
    const postDate = { confirmedAt: postedLater ? fp.postedAt : weekDate.confirmedAt, ...(postedLater ? postedFrom : { source: weekDate.source, by: weekDate.by }) }
    return onEditBox ? (
      <FreshnessFooter resourceId={item.id} {...postDate} onEdit={() => onEditBox('this_week', 'This week’s schedule', [...new Set([fp.id, ...days.flatMap((d) => d.minyanim.map((m) => m.from.id))])])} />
    ) : (
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <FreshnessFooter resourceId={item.id} {...postDate} ask={false} />
        {canAdd && updatingIn !== key && updated?.in !== key && (
          <button type="button" onClick={() => open(key)} className="cursor-pointer text-[13.5px] font-bold text-primary hover:underline">
            Update their times
          </button>
        )}
      </div>
    )
  }
  // The week's: its post, or, a week of only dated services (a
  // newsletter's "Shabbat Oct 24"), the first of them (BZBI, Oct 22).
  const weekFootPost = weekdayDays.flatMap((d) => d.minyanim).find((m) => m.from === post)?.from ?? weekdayDays[0]?.minyanim[0]?.from
  const shabbosPost = shabbosDays.flatMap((d) => d.minyanim).find((m) => m.from === post)?.from ?? shabbosDays[0]?.minyanim[0]?.from
  const shabbosRows = shabbosDays.flatMap((d) => d.rows)
  const weekdayRows = weekdayDays.flatMap((d) => d.rows)

  // The days the week's box speaks for: a week the shul posted is this
  // week's, Sunday to Friday, whichever days it has a minyan (the user, Oct
  // 27: Rodeph Shalom's whole week read "Oct 29", its one weekday minyan).
  // A day it doesn't reach has nothing, its usual times not put in.
  const weekGivesWeekdays = weekdayDays.some((d) => d.minyanim.some((m) => m.from.kind === 'week'))
  const weekdayDates = !weekdayDays.length
    ? ''
    : weekGivesWeekdays && thisWeek.range
      ? datesText(daysFrom(thisWeek.range.to, -6), daysFrom(thisWeek.range.to, -1))
      : datesText(weekdayDays[0].date, weekdayDays.at(-1)!.date)

  // This week's weekdays (board 5e, Nov 19): a grid, a row a date from
  // Sunday, the days gone by greyed and today tinted; or no minyan in it.
  // A week whose every weekday is gone by (Shabbos, before havdalah) has
  // nothing left to say: This Shabbos is the week (the user, Oct 23).
  const fullGrid = weekGrid(weekdayDays.length ? weekDaysFrom(weekdayDays, thisWeek.posts) : [])
  const grid = fullGrid && todayDate && fullGrid.rows.every((r) => r.date < todayDate) ? null : fullGrid
  const datesAside = (text: string, testId: string) => (
    <span className="text-[14.5px] text-slate-600" data-testid={testId}>
      {text}
    </span>
  )
  const weekDated =
    grid ? (
      <Card key="week-dated" title="This week" action={datesAside(weekdayDates, 'davening-this-week-dates')} testId="davening-this-week" footer={postFootFor(weekFootPost, 'this-week', weekdayDays)}>
        <WeekGridTable grid={grid} todayDate={todayDate} marks={!weekdayRows.every((m) => m.signUp)} />
        {/* A link under the grid, naming the minyanim it's for, as under
            the usual table: "Join Thu Shacharis on Zoom". */}
        {[...Map.groupBy(weekdayRows.filter((m) => m.joinLink?.trim()), (m) => m.joinLink!.trim())].map(([link, ms]) => (
          <JoinLink
            key={link}
            link={link}
            what={`${formatDays(DAY_KEYS.filter((d) => ms.some((m) => m.days.includes(d))))} ${[...new Set(ms.map((m) => TEFILLAH_LABELS[m.tefillah]))].join(' & ')}`}
            className="mt-2 block text-[14px]"
          />
        ))}
        {!allSignUp &&
          signUpBoxes(
            weekdayRows.filter((m) => m.signUp),
            { section: weekdayRows.every((m) => m.signUp) ? 'All this week’s times' : undefined, tapped: tappedRow },
          )}
        {updateIn('this-week')}
      </Card>
    ) : thisWeek.none && !weekRows.length ? (
      // Their calendar read, and nothing in it this week: said, never left
      // out, which reads as not knowing (the user, Oct 23).
      <Card key="week-dated" title="This week" action={datesAside(datesText(thisWeek.none.from, thisWeek.none.to), 'davening-this-week-dates')} testId="davening-no-minyan" footer={postFootFor(thisWeek.none, 'this-week')}>
        <p className="mt-1 text-[15.5px] font-bold text-slate-900">No minyan this week</p>
        {updateIn('this-week')}
      </Card>
    ) : null
  // This Shabbos's own times, once they're out (board 5e): names, times
  // lined up on the right, under Friday night and Shabbos.
  const shabbosDated = shabbosDays.length > 0 && (
    <Card
      key="shabbos-dated"
      title="This Shabbos"
      action={datesAside(datesText(shabbosDays[0].date, shabbosDays.at(-1)!.date), 'davening-this-shabbos-dates')}
      testId="davening-this-shabbos"
      footer={postFootFor(shabbosPost, 'this-shabbos', shabbosDays)}
    >
      <ShabbosRows items={weekShabbosItems(shabbosDays, todayDate, anchors)} anchors={anchors} marks={!shabbosRows.every((m) => m.signUp)} />
      {!allSignUp &&
        signUpBoxes(
          shabbosRows.filter((m) => m.signUp),
          { section: shabbosRows.every((m) => m.signUp) ? 'All this Shabbos’s times' : undefined, tapped: tappedRow },
        )}
      {updateIn('this-shabbos')}
    </Card>
  )

  // Each part once, the open boxes in the order of the clock, then the
  // usual ones this week's replace, folded, weekdays first (board 5e).
  const weekdaysOpen = [weekDated, weekBox.open]
  const shabbosOpen = [shabbosDated, shabbosBox.open]
  return (
    <div className="space-y-3.5" data-testid="listing-davening">
      {/* Every minyan here only runs when enough sign up: one box, on top,
          for the place, rather than one under each box of times. */}
      {allSignUp && !tappedRow && signUpBoxes(rows, { place: true })}
      {notPosted && !specialSchedule && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3" data-testid="davening-not-posted">
          <p className="text-[14.5px] font-bold text-caution">{notPosted.festival} times not posted</p>
          <p className="mt-0.5 text-[13.5px] leading-snug text-amber-900">These are their usual times. They may not apply during {notPosted.festival}.</p>
          {canAdd &&
            (sent ? (
              <p role="status" className="mt-2 text-[13.5px] font-semibold text-emerald-700">
                Thanks! An admin checks them before everyone sees them.
              </p>
            ) : adding ? (
              <AddScheduleBox item={item} festival={notPosted.festival} onSent={() => setSent(true)} onClose={() => setAdding(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-2 h-10 w-full cursor-pointer rounded-[10px] border-[1.5px] border-primary bg-white text-[14.5px] font-bold text-primary hover:bg-primary/5"
              >
                Know their {notPosted.festival} times? Add them
              </button>
            ))}
        </div>
      )}
      {specialSchedule && (
        <Card title={specialSchedule.name} testId="davening-special-box">
          <p className="text-[13.5px] font-semibold text-green-700" data-testid="davening-special">
            {specialSchedule.mode === 'replace' ? 'In place of their usual times' : 'As well as their usual times'} until {dateText(specialSchedule.to, { weekday: true })}
          </p>
          <SpecialTimes schedule={specialSchedule} />
        </Card>
      )}
      {shabbosFirst ? [...shabbosOpen, ...weekdaysOpen] : [...weekdaysOpen, ...shabbosOpen]}
      {weekBox.fold}
      {shabbosBox.fold}
      {!week && !shab && (
        <Card title="Davening times" testId="davening-none">
          <p className="pt-0.5 text-[14.5px] text-slate-700">No davening times listed yet.</p>
          {canAdd && updatingIn !== 'none' && updated?.in !== 'none' && (
            <button type="button" onClick={() => open('none')} className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 py-1 text-[14.5px] font-bold text-primary">
              <PlusIcon className="h-4 w-4" />
              Add their times
            </button>
          )}
          {updateIn('none')}
        </Card>
      )}
    </div>
  )
}

/** The week's weekdays for its grid: every date Sunday to Friday a post
 *  this week reaches, a day with nothing in it included (a dash), and any
 *  other day that has a time of its own (a one-day addition). */
function weekDaysFrom<D extends { date: string; rows: Minyan[] }>(days: readonly D[], posts: readonly SpecialSchedule[]): (D | { date: string; rows: Minyan[] })[] {
  const first = days[0].date
  const friday = daysFrom(first, 5 - DAY_KEYS.indexOf(weekdayOf(first)))
  const out: (D | { date: string; rows: Minyan[] })[] = []
  for (let d = daysFrom(friday, -5); d <= friday; d = daysFrom(d, 1)) {
    const given = days.find((x) => x.date === d)
    if (given) out.push(given)
    else if (posts.some((p) => p.whole && p.from <= d && d <= p.to && (!p.parts || p.parts.includes('weekdays')))) out.push({ date: d, rows: [] })
  }
  return out
}

/** "Oct 9–10", "Oct 30–Nov 1", "Oct 9". */
function datesText(fromDate: string, toDate: string): string {
  const from = dateText(fromDate)
  const to = dateText(toDate)
  const sameMonth = from.split(' ')[0] === to.split(' ')[0]
  return fromDate === toDate ? from : `${from}–${sameMonth ? to.split(' ')[1] : to}`
}

const weekdayOf = (date: string): DayKey => DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()]

const daysFrom = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

function Notes({ lines }: { lines: (string | null | undefined)[] }) {
  const shown = lines.filter((l): l is string => !!l)
  if (shown.length === 0) return null
  return (
    <div className="mt-2 space-y-1 text-[13px] leading-snug text-muted">
      {shown.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  )
}

/** Under a box of times with minyanim that only run when enough sign up:
 *  which, and where to sign up. One box per place people sign up (almost
 *  always one), named as the box's times say them: "Maariv 9:45 PM"; or,
 *  when every minyan in the box is one and they sign up in one place, the
 *  box's `section` ("All weekday times"). `place`: every minyan at the
 *  place is one, and one box on top speaks for it.
 *
 *  Opened from a minyan (`tapped`), where to sign up is already at the
 *  top: that minyan isn't named again, and a box for the whole section
 *  that signs up in the same place says so without the button. */
function signUpBoxes(minyanim: Minyan[], { section, place = false, tapped }: { section?: string; place?: boolean; tapped?: Minyan }) {
  const hrefOf = (m: Minyan) => (m.signUp && signUpAction(m.signUp)?.href) ?? ''
  const groups = new Map<string, Minyan[]>()
  for (const m of minyanim) groups.set(hrefOf(m), [...(groups.get(hrefOf(m)) ?? []), m])
  const whole = !!section && groups.size === 1
  const tappedHref = tapped?.signUp ? hrefOf(tapped) : null
  return [...groups].flatMap(([key, g]) => {
    const named = whole ? g : g.filter((m) => m.id !== tapped?.id)
    if (named.length === 0) return []
    return [
      <SignUpBox
        key={key}
        names={[...new Set(named.map((m) => `${TEFILLAH_LABELS[m.tefillah]} ${timeText(m)}`))]}
        section={whole ? section : undefined}
        signUp={g[0].signUp!}
        allSignUp={place}
        button={!(whole && key === tappedHref)}
      />,
    ]
  })
}

/** The week as one small table, a column a tefillah, today's row marked. */
/** `marks` false when every time in it only runs when enough sign up:
 *  the box under it says so once, for all of them. */
function WeekTable({ table, today, marks = true }: { table: NonNullable<ReturnType<typeof weekdayTable>>; today: DayKey | null; marks?: boolean }) {
  return (
    <table className="mt-1 w-full text-[14.5px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }} data-testid="davening-week-table">
      <thead>
        <tr>
          <th className="w-[5.5rem]" />
          {table.columns.map((t) => (
            <th key={t} scope="col" className="px-1.5 pb-1 text-left text-[11.5px] font-extrabold uppercase tracking-wide text-muted">
              {TEFILLAH_LABELS[t]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((r) => {
          const isToday = !!today && r.days.includes(today)
          return (
            <tr key={r.label} className={isToday ? 'bg-emerald-50' : undefined} data-today={isToday || undefined}>
              <th scope="row" className="rounded-l-lg py-2 pr-1.5 pl-2 text-left align-top font-bold text-slate-900">
                {r.label}
                {isToday && <span className="block text-[11px] font-extrabold tracking-wide text-emerald-700 uppercase">Today</span>}
              </th>
              {r.cells.map((c, i) => (
                <td key={table.columns[i]} className={`px-1.5 py-2 align-top last:rounded-r-lg ${c === '—' ? 'text-slate-400' : isToday ? 'font-bold text-slate-900' : 'text-slate-900'}`}>
                  {c === '—' ? '–' : r.parts[i].map((p, j) => (
                    <span key={j}>
                      {j > 0 && ', '}
                      {/* A sign-up minyan's time, marked in the colour of
                          its mark: the box under the table says which. */}
                      {p.signUp && marks ? (
                        <span className="rounded bg-amber-50 px-1 text-amber-900 ring-1 ring-amber-200/70" data-testid="sign-up-time">
                          {p.text}
                          <span className="sr-only"> (check group first)</span>
                        </span>
                      ) : (
                        p.text
                      )}
                    </span>
                  ))}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** One line of a Shabbos box (board 5e, Nov 19): a name, a time lined up
 *  on the right, and under the name in grey the rule a zman sets it by or
 *  its note. `ref`: havdalah, in grey. */
type ShabbosItem = { key: string; group: 'friday' | 'shabbos'; name: string; time: string; sub?: string | null; row?: Minyan }

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** A time set by a zman, as this week's clock time where it's known: candle
 *  lighting and havdalah are the coming Shabbos's; sunset is today's, so
 *  only on the day itself (never another day's, a minute or two off). */
function shabbosClock(row: Minyan, onDay: 'fri' | 'sat', today: DayKey | null, anchors: AnchorTimes | undefined): string | null {
  if (!row.anchor) return null
  if (row.anchor === 'sunset' && today !== onDay) return null
  return resolveAnchorTime(row, anchors)
}

/** A line for a minyan: its clock time this week with the rule under the
 *  name, or the rule itself as the time where the clock isn't known. */
function itemOf(key: string, group: ShabbosItem['group'], row: Minyan, when: string, at: string | null): ShabbosItem {
  const note = noteText(row.notes)
  const sub = [at ? `${capital(when)}, this week` : null, note].filter(Boolean).join(' · ') || null
  return { key, group, name: TEFILLAH_LABELS[row.tefillah], time: at ?? when, sub, row }
}

/** The usual Shabbos's lines, Friday night and then Shabbos. */
function usualShabbosItems(lines: readonly ShabbosLine[], anchors: AnchorTimes | undefined, today: DayKey | null): ShabbosItem[] {
  return lines.map((l) => {
    const onDay = l.part === 'friday' ? 'fri' : 'sat'
    return itemOf(`${l.row.id}:${l.part}`, l.part === 'friday' ? 'friday' : 'shabbos', l.row, l.when, shabbosClock(l.row, onDay, today, anchors))
  })
}

/** This Shabbos's lines, from the week's Friday night and Shabbos. */
function weekShabbosItems(days: readonly { date: string; rows: Minyan[] }[], todayDate: string | null, anchors: AnchorTimes | undefined): ShabbosItem[] {
  const today = todayDate ? weekdayOf(todayDate) : null
  return days.flatMap((d) => {
    const onDay = weekdayOf(d.date) === 'fri' ? 'fri' : 'sat'
    return d.rows.map((m) => itemOf(`${d.date}:${m.id}`, onDay === 'fri' ? 'friday' : 'shabbos', m, timeText(m), d.date === todayDate || m.anchor !== 'sunset' ? shabbosClock(m, onDay, d.date === todayDate ? onDay : today, anchors) : null))
  })
}

/** A Shabbos box's lines under two small labels, Friday night and Shabbos,
 *  havdalah closing the second in grey in the same column (board 5e). No
 *  candle lighting, though the board drew it: the city's time, not the
 *  shul's, and on the home page (the user, Oct 27, and again Nov 20). */
function ShabbosRows({ items, anchors, marks = true }: { items: readonly ShabbosItem[]; anchors: AnchorTimes | undefined; marks?: boolean }) {
  const havdalah = resolveAnchorTime({ anchor: 'havdalah' }, anchors)
  const groups = (
    [
      ['friday', 'Friday night', null],
      ['shabbos', 'Shabbos', havdalah ? { key: 'havdalah', group: 'shabbos', name: 'Havdalah', time: havdalah } : null],
    ] as const
  ).flatMap(([group, label, ref]) => {
    const own = items.filter((i) => i.group === group)
    return own.length ? [{ group, label, items: own, ref }] : []
  })
  return (
    <div data-testid="davening-shabbos-lines">
      {groups.map((g) => (
        <div key={g.group}>
          <p className="mx-2 mt-3 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{g.label}</p>
          {g.items.map((i, n) => (
            <div key={i.key} className={`flex items-baseline justify-between gap-3.5 px-2 py-2 text-[14.5px] ${n ? 'border-t border-slate-100' : ''}`}>
              <span className="min-w-0">
                <span className="font-semibold text-slate-900">{i.name}</span>
                {i.row?.signUp && marks && <SignUpMark className="ml-1.5 align-[1px]" />}
                {i.sub && <span className="mt-px block text-[12.5px] font-medium text-slate-500">{i.sub}</span>}
                {i.row && <JoinLink link={i.row.joinLink} className="mt-0.5 block text-[14px]" />}
              </span>
              <span className="text-right font-bold whitespace-nowrap text-slate-900 tabular-nums">{i.time}</span>
            </div>
          ))}
          {g.ref && (
            <div className="flex items-baseline justify-between gap-3.5 border-t border-slate-100 px-2 py-2 text-[13.5px] text-slate-500" data-testid="davening-zman">
              <span>{g.ref.name}</span>
              <span className="text-right whitespace-nowrap tabular-nums">{g.ref.time}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** This week's weekdays as a grid (board 5e): a row a date, the days gone
 *  by greyed, today tinted; a mark on a time with its own note, the note
 *  once under the grid. */
function WeekGridTable({ grid, todayDate, marks }: { grid: WeekGrid; todayDate: string | null; marks: boolean }) {
  return (
    <>
      <table className="mt-2 w-full text-[14px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }} data-testid="davening-this-week-days">
        <thead>
          <tr>
            <th className="w-[3.25rem]" />
            {grid.columns.map((t) => (
              <th key={t} scope="col" className="px-2 pb-1 text-left align-bottom text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                {TEFILLAH_LABELS[t]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((r) => {
            const isToday = r.date === todayDate
            const past = !!todayDate && r.date < todayDate
            const tone = past ? 'text-slate-400' : 'text-slate-900'
            return (
              <tr key={r.date} className={isToday ? 'bg-emerald-50' : undefined} data-today={isToday || undefined} data-past={past || undefined}>
                <th scope="row" className={`rounded-l-lg border-t px-2 py-2 text-left align-top font-bold ${isToday ? 'border-transparent' : 'border-slate-100'} ${tone}`}>
                  {DAY_LABELS[weekdayOf(r.date)]}
                  <small className={`block text-[12px] font-semibold whitespace-nowrap ${past ? 'text-slate-400' : 'text-slate-600'}`}>{dateText(r.date)}</small>
                  {r.occasion && <small className="block text-[12px] font-semibold text-slate-600">{r.occasion}</small>}
                  {isToday && <span className="block text-[11px] font-extrabold tracking-wide text-emerald-700 uppercase">Today</span>}
                </th>
                {r.cells.map((c, i) => (
                  <td key={grid.columns[i]} className={`border-t px-2 py-2 align-top last:rounded-r-lg ${isToday ? 'border-transparent' : 'border-slate-100'} ${c.length ? tone : 'text-slate-400'}`}>
                    {c.length
                      ? c.map((p, j) => (
                          <span key={j}>
                            {j > 0 && ', '}
                            {p.signUp && marks ? (
                              <span className="rounded bg-amber-50 px-1 text-amber-900 ring-1 ring-amber-200/70" data-testid="sign-up-time">
                                {p.text}
                                <span className="sr-only"> (check group first)</span>
                              </span>
                            ) : (
                              p.text
                            )}
                            {p.mark}
                          </span>
                        ))
                      : '–'}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      {grid.notes.map((n) => (
        <p key={n.mark} className="mx-2 mt-1 text-[13px] text-slate-600">
          {n.mark} {n.text}
        </p>
      ))}
    </>
  )
}

const DAY_LABELS: Record<DayKey, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' }

/** Every time in a special schedule, by the days it's held on. */
function SpecialTimes({ schedule }: { schedule: SpecialSchedule }) {
  const groups = new Map<string, SpecialSchedule['minyanim']>()
  for (const m of schedule.minyanim) {
    const label = m.on.map(scheduleDayText).join(', ')
    groups.set(label, [...(groups.get(label) ?? []), m])
  }
  return (
    <div className="mt-1" data-testid="davening-special-all">
      {[...groups].map(([label, rows]) => (
        <SpecialDay key={label} label={label} rows={rows} />
      ))}
    </div>
  )
}

/** One day's times in a schedule, under its name. */
function SpecialDay({ label, rows }: { label: string; rows: SpecialSchedule['minyanim'] }) {
  return (
    <div className="border-t border-slate-100 py-1.5 first:border-t-0">
      <p className="text-[12px] font-extrabold uppercase tracking-wide text-muted">{label}</p>
      {[...rows]
        .sort((a, b) => TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah) || (clockMinutes(a.time) ?? 1440) - (clockMinutes(b.time) ?? 1440))
        .map((m) => {
          const note = noteText(m.notes)
          return (
            <div key={m.id} className="grid grid-cols-[9.5rem_1fr] gap-2.5 py-0.5 text-[15px]">
              <span className="font-semibold text-slate-900">{TEFILLAH_LABELS[m.tefillah]}</span>
              <span className="text-slate-900">
                <b>{timeText(m)}</b>
                {note ? <span className="text-muted"> · {note}</span> : null}
                <JoinLink link={m.joinLink} className="block text-[14px]" />
              </span>
            </div>
          )
        })}
    </div>
  )
}

/** A shul's usual times as its listing draws them (the weekday table and
 *  the Shabbos lines), with nothing to tap: the admin's How it looks (the
 *  user, Nov 10: "davening times isn't in the format we actually have"). */
export function UsualTimes({ minyanim }: { minyanim: unknown }) {
  const rows = regularMinyanim(minyanim)
  const week = weekdayTable(rows, null, undefined, { perDay: true })
  const shab = shabbosList(rows, null, undefined)
  return (
    <div data-testid="usual-times">
      {week && (
        <>
          <p className="mt-1 text-[12px] font-extrabold uppercase tracking-wide text-muted">Usual weekday times</p>
          <WeekTable table={week} today={null} marks={false} />
        </>
      )}
      {shab && (
        <>
          <p className="mt-2 text-[12px] font-extrabold uppercase tracking-wide text-muted">Usual Shabbos times</p>
          <ShabbosRows items={usualShabbosItems(shab.lines, undefined, null)} anchors={undefined} marks={false} />
        </>
      )}
    </div>
  )
}
