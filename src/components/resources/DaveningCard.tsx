'use client'

import { useContext, useState, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { formatDays, isMinyanim, signUpAction, TEFILLAH_LABELS, TEFILLAH_ORDER, type Minyan } from '@/lib/davening'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { geoKey, geoOrCommunityDefault, resolveAnchorTime, type AnchorTimes } from '@/lib/useZmanAnchors'
import { dateText, readSchedules, regularMinyanim, scheduleDayText, sendsWeekly, shabbosComesFirst, thisWeeksDays, usualJoinLink, usualSignUp, weekByDates, type DayPosting, type SpecialSchedule, type WeekDayTimes } from '@/lib/schedules'
import { isShabbosRow } from '@/lib/minyanText'
import { clockMinutes, noteText, SHABBOS_PART_LABELS, shabbosList, timeText, weekdayTable, type ShabbosLine } from '@/lib/weekTable'
import { DAY_KEYS, type DayKey } from '@/lib/hours'
import { boxDate, isMinyanOnly } from '@/lib/listingView'
import { THIS_WEEK_SECTION } from '@/lib/boxDates'
import { resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { ui } from '@/lib/uiConfig'
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
  onEditBox?: (box: MinyanBox, title: string, week?: string) => void
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
  const canAdd = ui.contributions.edit && (!category || resolveCapabilities(category.capabilities).edit)

  // Whose times today's and tomorrow's are: a special schedule's, or the
  // regular ones on a festival day with none posted.
  const schedules = readSchedules(rawSchedules)
  const posting: DayPosting[] = schedule ? [schedule.today, schedule.tomorrow].map((d) => schedule.posting[item.id]?.[d.date] ?? { kind: 'regular' }) : []
  // "This week's schedule" (the user, Oct 20: one schedule for a week):
  // the weeks the shul sent out or its website gives, and this week's
  // one-day additions, day by day (thisWeeksDays).
  const thisWeek = schedule ? thisWeeksDays(schedules, schedule.today.date, { shabbosOver: schedule.shabbosOver, regular: regularMinyanim(minyanim) }) : { days: [], posts: [], none: null }
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
  // A minyan that meets somewhere, not a shul (Oct 16): its times and
  // nothing else; no asking for the Shabbos or weekday times it won't have.
  const minyanOnly = !!category && isMinyanOnly(item, category)
  const season = schedule?.season ?? null
  const anchors = schedule?.anchors[geoKey(geoOrCommunityDefault(item.geo))]
  // A summer/winter pair goes by its zman (seasonPairs.ts).
  const week = weekdayTable(rows, season, anchors)
  const shab = shabbosList(rows, season, anchors)
  const today = schedule?.todayKey ?? null

  // This week's schedule, when the shul sends one out (Oct 6): what it sent
  // for this week, or a box waiting for it.
  const todayDate = schedule?.today.date ?? null
  // The week it shows that Edit opens: the newsletter's, if there's one;
  // or their calendar's week with no minyan in it (SpecialSchedule.whole).
  const post = thisWeek.posts[0] ?? thisWeek.none ?? undefined
  const waiting = !post && !!todayDate && sendsWeekly(schedules, todayDate)
  // A week's minyanim, each with the sign-up of the usual minyan it stands
  // in for (usualSignUp); a one-day addition is its own. And its usual
  // minyan's join link, when the week gives none (usualJoinLink).
  const weekRows = thisWeek.days.map((d) => ({
    ...d,
    rows: d.minyanim.map(({ minyan: { on: _on, ...m }, from }): Minyan => {
      void _on
      const weekday = weekdayOf(d.date)
      const signUp = from.kind === 'week' ? usualSignUp(rows, m, [weekday]) : undefined
      const joinLink = usualJoinLink(rows, m, [weekday])
      return { ...m, days: [weekday], ...(signUp ? { signUp } : {}), ...(joinLink ? { joinLink } : {}) }
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
  // Friday's candle lighting heads This Shabbos, when the zmanim are that
  // Friday's: the shul's own, else the community's.
  const shabbosFriday = shabbosDays.length ? (weekdayOf(shabbosDays[0].date) === 'fri' ? shabbosDays[0].date : dayBefore(shabbosDays.at(-1)!.date)) : null
  const candleLighting = !shabbosFriday
    ? null
    : anchors?.candleLightingIso?.slice(0, 10) === shabbosFriday
      ? resolveAnchorTime({ anchor: 'candle_lighting' }, anchors)
      : schedule?.candleLighting?.iso.slice(0, 10) === shabbosFriday
        ? schedule.candleLighting.time
        : null
  const shabbosShown = shabbosFriday && candleLighting && !shabbosDays.some((d) => d.date === shabbosFriday) ? [{ date: shabbosFriday, occasion: null, minyanim: [], rows: [] }, ...shabbosDays] : shabbosDays

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
  const foot = (key: string, section: 'weekday' | 'shabbos', subject: string) =>
    onEditBox ? (
      <FreshnessFooter
        resourceId={item.id}
        {...boxDate(item, section)}
        section={section}
        onEdit={() => onEditBox(section, section === 'weekday' ? 'Usual weekday times' : 'Usual Shabbos times')}
      />
    ) : (
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <FreshnessFooter resourceId={item.id} {...boxDate(item, section)} subject={subject} section={section} />
        {canAdd && updatingIn !== key && updated?.in !== key && (
          <button type="button" onClick={() => open(key)} className="cursor-pointer text-[13.5px] font-bold text-primary hover:underline">
            Update their times
          </button>
        )}
      </div>
    )

  const folded = (key: 'week' | 'shabbos', title: string, body: ReactNode) => {
    const reason = foldReason(key)
    return reason && !unfolded[key] ? (
      <button
        key={key}
        type="button"
        onClick={() => setUnfolded((u) => ({ ...u, [key]: true }))}
        aria-expanded={false}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left"
        data-testid="davening-folded"
      >
        <span>
          <span className="block text-base font-extrabold text-slate-900">{title}</span>
          <span className="mt-0.5 block text-[13.5px] text-muted">{reason}</span>
        </span>
        <ChevronRightIcon className="h-5 w-5 shrink-0 rotate-90 text-slate-400" />
      </button>
    ) : (
      body
    )
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
    ? folded(
        'week',
        'Usual weekday times',
        <Card key="week" title={weekFold ? undefined : 'Usual weekday times'} testId="davening-weekday" footer={foot('week', 'weekday', 'Weekday times')} muted={!!weekFold}>
          {weekFold}
          <WeekTable table={week} today={today} marks={!week.everySignUp} />
          <Notes
            lines={[
              ...week.rules.map((r) => {
                const at = resolveAnchorTime(r.row, anchors)
                return at ? `${capital(r.text)}: ${at} today.` : null
              }),
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
    : shab && !minyanOnly && (
        <div key="week" className="px-1" data-testid="davening-no-weekday">
          <p className="text-[13.5px] text-muted">
            No weekday minyan listed.{' '}
            {canAdd && updatingIn !== 'no-weekday' && (
              <button type="button" onClick={() => open('no-weekday')} className="cursor-pointer font-bold text-primary hover:underline">
                Add one
              </button>
            )}
          </p>
          {updateIn('no-weekday')}
        </div>
      )

  const shabbosBox = shab
    ? folded(
        'shabbos',
        'Usual Shabbos times',
        <Card key="shabbos" title={shabbosFold ? undefined : 'Usual Shabbos times'} testId="davening-shabbos" footer={foot('shabbos-usual', 'shabbos', 'Shabbos times')} muted={!!shabbosFold}>
          {shabbosFold}
          <ShabbosLines lines={shab.lines} anchors={anchors} today={today} marks={!shab.lines.every((l) => l.row.signUp)} />
          <Notes lines={[shab.otherSeason]} />
          {!allSignUp &&
            signUpBoxes([...new Set(shab.lines.filter((l) => l.row.signUp).map((l) => l.row))], {
              section: shab.lines.every((l) => l.row.signUp) ? 'All Shabbos times' : undefined,
              tapped: tappedRow,
            })}
          {updateIn('shabbos-usual')}
        </Card>,
      )
    : week && !minyanOnly && (
        <Card key="shabbos" title="Usual Shabbos times" testId="davening-shabbos">
          <p className="pt-0.5 text-[14.5px] leading-relaxed text-slate-700">Their Shabbos times aren’t listed yet.{canAdd ? ' If you’ve davened there, add them.' : ''}</p>
          {canAdd && updatingIn !== 'shabbos' && (
            <button type="button" onClick={() => open('shabbos')} className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 py-1 text-[14.5px] font-bold text-primary">
              <PlusIcon className="h-4 w-4" />
              Add their Shabbos times
            </button>
          )}
          {updateIn('shabbos')}
        </Card>
      )

  // The week's own line, the same as every box's (the user, Oct 19): who
  // confirmed it and when, Edit at its end, opening its own times. The
  // approval that put it up dated the listing, so that date, unless the
  // week was posted later than any confirmation (an older row).
  // A week of only dated services (a newsletter's "Shabbat Oct 24"), no
  // week posted: the first of them, or the box had no line at all (BZBI,
  // the user, Oct 22).
  /** A box of this week's own line: `fp` is the post its times are from,
   *  which its Edit opens. */
  const postFootFor = (fp: SpecialSchedule | undefined, key: string) => {
    if (!fp) return undefined
    // When it was posted, or the date the shul's website last gave the
    // week's times (THIS_WEEK_SECTION) or a person the whole place, if
    // later: never a date a check gave the whole listing (boxDates.ts).
    const weekDate = boxDate(item, THIS_WEEK_SECTION)
    const postedLater = !weekDate.confirmedAt || (!!fp.postedAt && fp.postedAt > weekDate.confirmedAt)
    const postDate = { confirmedAt: postedLater ? fp.postedAt : weekDate.confirmedAt, ...(postedLater ? {} : { source: weekDate.source, by: weekDate.by }) }
    return onEditBox ? (
      <FreshnessFooter resourceId={item.id} {...postDate} onEdit={() => onEditBox('this_week', 'This week’s schedule', fp.id)} />
    ) : (
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <FreshnessFooter resourceId={item.id} {...postDate} subject="Times" ask={false} />
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

  // This week's, as one: waiting for it, no minyan in it, or its weekdays.
  const weekDated = (
    <div key="week-dated" className="space-y-5 empty:hidden">
      {!waiting && weekdayDays.length > 0 && (
        <Card title="This week’s schedule" testId="davening-this-week" footer={postFootFor(weekFootPost, 'this-week')}>
          <p className="text-[14.5px] font-semibold text-slate-700" data-testid="davening-this-week-dates">
            {datesText(weekdayDays[0].date, weekdayDays.at(-1)!.date)}
          </p>
          <WeekDays days={weekdayDays} todayDate={todayDate} nowMinutes={schedule?.nowMinutes} anchors={anchors} marks={!weekdayRows.every((m) => m.signUp)} />
          {!allSignUp &&
            signUpBoxes(
              weekdayRows.filter((m) => m.signUp),
              { section: weekdayRows.every((m) => m.signUp) ? 'All this week’s times' : undefined, tapped: tappedRow },
            )}
          {updateIn('this-week')}
        </Card>
      )}
      {/* Their calendar read, and nothing in it this week: said, never left
          out, which reads as not knowing (the user, Oct 23). */}
      {thisWeek.none && !weekRows.length && (
        <Card title="This week’s schedule" testId="davening-no-minyan" footer={postFootFor(thisWeek.none, 'this-week')}>
          <p className="text-[14.5px] font-semibold text-slate-700">{postTitle(thisWeek.none)}</p>
          <p className="mt-1 text-[15.5px] font-bold text-slate-900">No minyan this week</p>
          {updateIn('this-week')}
        </Card>
      )}
      {waiting && (
        <Card title="This week’s schedule" testId="davening-this-week-waiting">
          <p className="pt-0.5 text-[15px] text-slate-700">Not on the guide yet</p>
          {canAdd && updatingIn !== 'this-week' && !(updated?.in === 'this-week') && (
            <button
              type="button"
              onClick={() => open('this-week')}
              className="mt-2.5 flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white text-[15px] font-bold text-primary hover:bg-slate-50"
            >
              <PlusIcon className="h-4 w-4" />
              Add this week’s schedule
            </button>
          )}
          {weekRows.length > 0 && <WeekDays days={weekRows} todayDate={todayDate} nowMinutes={schedule?.nowMinutes} anchors={anchors} marks />}
          {updateIn('this-week')}
        </Card>
      )}
    </div>
  )
  // This Shabbos's own times, once they're out (drawn Oct 26): until then
  // only the usual Shabbos box, with no dates of its own.
  const shabbosDated = !waiting && shabbosDays.length > 0 && (
    <Card key="shabbos-dated" title="This Shabbos" testId="davening-this-shabbos" footer={postFootFor(shabbosPost, 'this-shabbos')}>
      <p className="text-[14.5px] font-semibold text-slate-700" data-testid="davening-this-shabbos-dates">
        {shabbosPost && !weekByDates(shabbosPost) && shabbosDays.every((d) => d.minyanim.every((m) => m.from === shabbosPost))
          ? postTitle(shabbosPost)
          : datesText(shabbosShown[0].date, shabbosShown.at(-1)!.date)}
      </p>
      <WeekDays days={shabbosShown} todayDate={todayDate} nowMinutes={schedule?.nowMinutes} anchors={anchors} marks={!shabbosRows.every((m) => m.signUp)} candleLighting={candleLighting && shabbosFriday ? { date: shabbosFriday, time: candleLighting } : undefined} />
      {!allSignUp &&
        signUpBoxes(
          shabbosRows.filter((m) => m.signUp),
          { section: shabbosRows.every((m) => m.signUp) ? 'All this Shabbos’s times' : undefined, tapped: tappedRow },
        )}
      {updateIn('this-shabbos')}
    </Card>
  )

  return (
    <div className="space-y-5" data-testid="listing-davening">
      {/* Every minyan here only runs when enough sign up: one box, on top,
          for the place, rather than one under each box of times. */}
      {allSignUp && !tappedRow && signUpBoxes(rows, { place: true })}
      {shabbosFirst ? [shabbosDated, weekDated] : [weekDated, shabbosDated]}
      {specialSchedule && (
        <Card title={specialSchedule.name} testId="davening-special-box">
          <p className="text-[13.5px] font-semibold text-green-700" data-testid="davening-special">
            {specialSchedule.mode === 'replace' ? 'In place of their usual times' : 'As well as their usual times'} until {dateText(specialSchedule.to, { weekday: true })}
          </p>
          <SpecialTimes schedule={specialSchedule} />
        </Card>
      )}
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
      {shabbosFirst ? [shabbosBox, weekBox] : [weekBox, shabbosBox]}
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

/** A week post's times as regular rows, each on its date's weekday, for the
 *  same table and Shabbos lines as the usual times. */
/** "Shabbos Bereishis, Oct 9–10"; just the dates for a name the guide made
 *  up ("Times for Oct 9 – Oct 10"), or for a heading over more than a
 *  Shabbos (weekKeepsHeading), as weeks read before that rule were named. */
function postTitle(post: SpecialSchedule): string {
  const dates = datesText(post.from, post.to)
  return weekByDates(post) ? dates : `${post.name}, ${dates}`
}

/** "Oct 9–10", "Oct 30–Nov 1", "Oct 9". */
function datesText(fromDate: string, toDate: string): string {
  const from = dateText(fromDate)
  const to = dateText(toDate)
  const sameMonth = from.split(' ')[0] === to.split(' ')[0]
  return fromDate === toDate ? from : `${from}–${sameMonth ? to.split(' ')[1] : to}`
}

const weekdayOf = (date: string): DayKey => DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()]

const dayBefore = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

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
                  {r.parts[i].map((p, j) => (
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

/** This week's clock time for a rule, in grey: "this Friday 6:12 PM". Only
 *  where it's this week's: candle lighting and havdalah are the coming
 *  Shabbos's; sunset is today's, so it's given only on the day itself. */
function thisWeek(line: ShabbosLine, anchors: AnchorTimes | undefined, today: DayKey | null): string | null {
  const row = line.row
  if (!row.anchor) return null
  const onDay = line.part === 'friday' ? 'fri' : 'sat'
  if (row.anchor === 'sunset' && today !== onDay) return null
  const at = resolveAnchorTime(row, anchors)
  if (!at) return null
  if (today === onDay) return `${line.part === 'motzei' ? 'Tonight' : 'Today'} ${at}`
  return `${line.part === 'friday' ? 'This Friday' : line.part === 'motzei' ? 'This Motzei Shabbos' : 'This Shabbos'} ${at}`
}

function ShabbosLines({ lines, anchors, today, marks = true }: { lines: ShabbosLine[]; anchors: AnchorTimes | undefined; today: DayKey | null; marks?: boolean }) {
  return (
    <div className="divide-y divide-slate-100" data-testid="davening-shabbos-lines">
      {lines.map((l, i) => {
        const first = i === 0 || lines[i - 1].part !== l.part
        const sub = [l.note, thisWeek(l, anchors, today)].filter(Boolean).join(' · ')
        return (
          <div key={`${l.row.id}:${l.part}`} className="flex gap-3 py-2.5">
            <span className="w-[6.5rem] shrink-0 pt-0.5 text-[12px] font-extrabold tracking-wide text-muted uppercase">{first ? SHABBOS_PART_LABELS[l.part] : ''}</span>
            <span className="min-w-0 flex-1 text-[15px] leading-snug">
              <b className="font-bold text-slate-900">{TEFILLAH_LABELS[l.tefillah]}</b> <span className="text-slate-800">{l.when}</span>
              {l.row.signUp && marks && <SignUpMark className="ml-1.5 align-[1px]" />}
              {sub && <span className="mt-0.5 block text-[13px] text-muted">{sub}</span>}
              <JoinLink link={l.row.joinLink} className="mt-0.5 block text-[14px]" />
            </span>
          </div>
        )
      })}
    </div>
  )
}

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

/** This week's schedule, a day at a time (thisWeeksDays): the date, and
 *  an occasion's name beside it ("Thanksgiving, Thu Oct 8"), then its
 *  times. A time set by a zman has this week's clock time beside it where
 *  the guide knows it: candle lighting on the Friday, havdalah on Shabbos,
 *  sunset on the day itself. */
function WeekDays({
  days,
  todayDate,
  nowMinutes,
  anchors,
  marks,
  candleLighting,
}: {
  days: (WeekDayTimes & { rows: Minyan[] })[]
  todayDate: string | null
  /** Now, today: a time already started is greyed (drawn Oct 26). */
  nowMinutes?: number
  anchors: AnchorTimes | undefined
  marks: boolean
  /** This Shabbos's: Friday's candle lighting, heading that day. */
  candleLighting?: { date: string; time: string }
}) {
  const started = (isToday: boolean, time: string | null) => {
    const at = time === null ? null : clockMinutes(time)
    return isToday && nowMinutes !== undefined && at !== null && nowMinutes >= at
  }
  return (
    <div className="mt-1" data-testid="davening-this-week-days">
      {days.map((d) => {
        const date = dateText(d.date, { weekday: true })
        const isToday = d.date === todayDate
        const weekday = weekdayOf(d.date)
        return (
          <div key={d.date} className="border-t border-slate-100 py-1.5 first:border-t-0" data-today={isToday || undefined}>
            <p className="text-[12px] font-extrabold uppercase tracking-wide text-muted">
              {d.occasion ? `${d.occasion}, ${date}` : date}
              {isToday && <span className="ml-1.5 text-emerald-700">Today</span>}
            </p>
            {candleLighting?.date === d.date && (
              <div className={`grid grid-cols-[9.5rem_1fr] gap-2.5 py-0.5 text-[15px] ${started(isToday, candleLighting.time) ? 'text-slate-400' : 'text-slate-900'}`} data-testid="davening-candle-lighting">
                <span className="font-semibold">Candle lighting</span>
                <b>{candleLighting.time}</b>
              </div>
            )}
            {d.rows.map((m) => {
              const note = noteText(m.notes)
              const known = m.anchor === 'sunset' ? isToday : m.anchor === 'candle_lighting' ? weekday === 'fri' : m.anchor === 'havdalah' && weekday === 'sat'
              const at = known ? resolveAnchorTime(m, anchors) : null
              const past = started(isToday, at ?? m.time)
              return (
                <div key={m.id} className={`grid grid-cols-[9.5rem_1fr] gap-2.5 py-0.5 text-[15px] ${past ? 'text-slate-400' : 'text-slate-900'}`} data-past={past || undefined}>
                  <span className="font-semibold">{TEFILLAH_LABELS[m.tefillah]}</span>
                  <span>
                    <b>{timeText(m)}</b>
                    {m.signUp && marks && <SignUpMark className="ml-1.5 align-[1px]" />}
                    {at ? <span className="text-muted"> · {at}</span> : null}
                    {note ? <span className="text-muted"> · {note}</span> : null}
                    <JoinLink link={m.joinLink} className="block text-[14px]" />
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
