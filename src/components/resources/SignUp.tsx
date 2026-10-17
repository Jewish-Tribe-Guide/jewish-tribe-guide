'use client'

import { useEffect, useState } from 'react'
import { track } from '@vercel/analytics'
import { SIGN_UP_MARK, signUpAction, type MinyanSignUp } from '@/lib/davening'
import { useCategories } from '@/lib/useCategories'
import { useCommunitySlug } from '@/lib/communityContext'
import { primaryLink } from '@/lib/listingView'
import { loadPlaces } from '@/lib/loadPlaces'

// ── Minyanim that only run when enough sign up (the user, Oct 16) ──────────
// Some minyanim happen only on days ten say they're coming, in a WhatsApp
// group. The guide can't know whether today's is on, so it never sounds
// surer than that: wherever the time is shown (Minyanim by time, the
// listing's times) it carries the mark, and the listing says where to
// sign up, in one box with one button. Not on a category row, which shows
// no times at all (Oct 15).

/** "Check group first", beside a sign-up minyan's time. Amber, the colour
 *  of notes, which this is: gold is kept for candle lighting and Shabbos. */
export function SignUpMark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-px text-[12px] font-bold text-amber-800 ring-1 ring-amber-200/70 ${className}`} data-testid="sign-up-mark">
      {SIGN_UP_MARK}
    </span>
  )
}

/** The way to sign up: the group's link ("Say you're coming"), or a person
 *  to text, with the number written out (a text link does nothing on a
 *  computer). Nothing when there's neither. */
export function SignUpButton({ signUp }: { signUp: MinyanSignUp }) {
  const action = signUpAction(signUp)
  if (!action) return null
  const link = !action.phone
  return (
    <>
      <a
        href={action.href}
        {...(link ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        onClick={() => track('listing_action', { action: link ? 'Sign up for a minyan' : 'Text to sign up for a minyan' })}
        className="mt-1 flex h-10.5 w-full cursor-pointer items-center justify-center rounded-full bg-primary px-4 text-[15px] font-bold text-white hover:bg-primary-dark"
      >
        {action.label}
      </a>
      {action.phone && <p className="text-center text-[14px] font-semibold text-slate-800 select-all">{action.phone}</p>}
    </>
  )
}

/**
 * Under a box of times with sign-up minyanim in it: which ones, that the
 * place's other times are regular, and where to sign up. One box per place
 * people sign up, which is almost always one.
 *
 * `names` are the minyanim as the box's own times say them ("Maariv 9:45
 * PM"); `section` instead, when every minyan in the box of times is one
 * ("All weekday times": the user, Oct 16), rather than naming them all
 * again under the table that lists them. `allSignUp` says every minyan at
 * the place is one, when there are no "other times" to call regular and
 * the box speaks for the place. `button` false when the minyan tapped to
 * open the place already has it, at the top (TappedMinyan).
 */
export function SignUpBox({ names, section, signUp, allSignUp, button = true }: { names: string[]; section?: string; signUp: MinyanSignUp; allSignUp: boolean; button?: boolean }) {
  const one = !section && names.length === 1
  const heading = allSignUp ? 'Check the group before you go' : `${section ?? names.join(', ')}: check the group first`
  return (
    <div className={`space-y-1.5 rounded-lg bg-primary/[0.07] px-3.5 py-3 ${allSignUp ? '' : 'mt-3'}`} data-testid="sign-up-box">
      <p className="text-[15px] font-extrabold leading-snug text-ink">{heading}</p>
      <p className="text-[13.5px] leading-snug text-slate-700">
        {one || allSignUp ? 'It only runs' : 'They only run'} on days enough people sign up.{allSignUp ? '' : ' Their other times are regular.'}
      </p>
      {button && <SignUpButton signUp={signUp} />}
    </div>
  )
}

/** The community's WhatsApp groups that have a join link, to pick from:
 *  most sign-up minyanim's groups are listed already. Empty until they've
 *  loaded, and when there's no such category. */
function useWhatsAppGroups(): { name: string; link: string }[] {
  const community = useCommunitySlug()
  const category = useCategories().find((c) => /whatsapp/i.test(c.label))
  const [groups, setGroups] = useState<{ name: string; link: string }[]>([])
  useEffect(() => {
    if (!category) return
    let live = true
    loadPlaces(community, category.id)
      .then((places) => {
        if (!live) return
        setGroups(
          places
            .flatMap((p) => {
              const link = primaryLink(p, category)?.href
              return link ? [{ name: p.name, link }] : []
            })
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [community, category])
  return groups
}

const field = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none'

/** Whether a link typed for a group can be opened: a web link. */
export const signUpLinkOk = (link: string | undefined) => !link?.trim() || /^https?:\/\/\S+$/i.test(link.trim())

/**
 * One minyan's "Only on days enough people sign up?" and, on Yes, where:
 * a WhatsApp group (picked from the guide's, or its link pasted) or, for a
 * group that's invite-only, someone to text. Under the minyan editor's
 * More, beside Time of year.
 */
export function SignUpFields({ signUp, onChange }: { signUp: MinyanSignUp | undefined; onChange: (signUp: MinyanSignUp | undefined) => void }) {
  const groups = useWhatsAppGroups()
  const on = !!signUp
  const set = (p: Partial<MinyanSignUp>) => onChange(Object.fromEntries(Object.entries({ ...signUp, ...p }).filter(([, v]) => v)) as MinyanSignUp)
  const picked = groups.find((g) => g.link === signUp?.link)
  return (
    <div className="space-y-2" data-testid="sign-up-fields">
      <p className="text-[14px] font-bold text-slate-700">Only on days enough people sign up?</p>
      <div className="flex gap-1 rounded-xl bg-slate-100 p-[3px]" role="group" aria-label="Only on days enough people sign up?">
        {([false, true] as const).map((yes) => (
          <button
            key={String(yes)}
            type="button"
            aria-pressed={on === yes}
            onClick={() => onChange(yes ? (signUp ?? {}) : undefined)}
            className={`h-10 flex-1 cursor-pointer rounded-[10px] text-[14.5px] ${on === yes ? 'bg-white font-bold text-slate-900 shadow-sm' : 'font-semibold text-muted'}`}
          >
            {yes ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
      {signUp && (
        <div className="space-y-2 pt-1">
          <p className="text-[14px] font-bold text-slate-700">Where do they sign up?</p>
          {groups.length > 0 && (
            <select
              value={picked?.link ?? ''}
              onChange={(e) => set({ link: e.target.value || undefined })}
              aria-label="Their WhatsApp group"
              className={`${field} font-semibold`}
            >
              <option value="">{picked ? 'Their WhatsApp group' : 'Pick their WhatsApp group'}</option>
              {groups.map((g) => (
                <option key={g.link} value={g.link}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="url"
            inputMode="url"
            value={signUp.link ?? ''}
            onChange={(e) => set({ link: e.target.value || undefined })}
            placeholder={groups.length ? 'Or paste the group’s link' : 'The group’s link'}
            aria-label="The group’s link"
            className={field}
          />
          {!signUpLinkOk(signUp.link) && <p className="text-[13px] text-caution">Paste the whole link, starting https://</p>}
          <p className="pt-1 text-[13.5px] text-muted">Invite-only? Someone to text to be added:</p>
          <div className="flex gap-2">
            <input type="text" value={signUp.name ?? ''} maxLength={40} onChange={(e) => set({ name: e.target.value || undefined })} placeholder="Name" aria-label="Who to text" className={`${field} min-w-0 flex-1`} />
            <input type="tel" value={signUp.phone ?? ''} maxLength={24} onChange={(e) => set({ phone: e.target.value || undefined })} placeholder="Phone" aria-label="Their phone" className={`${field} min-w-0 flex-1`} />
          </div>
        </div>
      )}
    </div>
  )
}
