'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { adminBase } from '@/lib/adminNav'
import { useOptionalCommunitySlug } from '@/lib/communityContext'
import { MINYAN_PARTS, slugifyFieldKey, TYPE_IS_FILTERABLE, type CategoryField, type FieldType } from '@/lib/categories'
import { canGoUnderName, cardPatch, underName } from '@/lib/cardLines'
import { fieldAbout, fieldRules } from '@/lib/fieldAbout'
import { partnerRule } from '@/lib/fieldPartners'
import { KOSHER_CAVEAT } from '@/lib/kosherQuestions'
import { AdminBack, AdminBox, AdminField, AdminSwitch, AdminYesNo } from './AdminUI'
import ChoiceList from './ChoiceList'

// A field's own screen. A ready-made field's (canvas row "Each kind of
// field", Nov 7) reads like a shop listing: "What this is" first, then
// "What you can change", each option a switch at its setting, and "Remove
// from <page>"; its name, note and what it does are the same everywhere.
// One made here (board 13, Nov 5) is this page's to define: Basics (its
// name and the note under it on Add a place), its choices as rows, and the
// questions its kind asks, each a No / Yes. What the boards take off a
// community admin's screen (only for some places, an audience, a link's own
// box, a badge in place of another) keeps working, set or not. No "More"
// for a superadmin either (the user, Nov 10: "yes remove it").

const KIND: Record<FieldType, string> = {
  select: 'Choices',
  boolean: 'Yes or no',
  tags: 'A list of items',
  text: 'Text',
  textarea: 'Text',
  url: 'Link',
  tel: 'Phone',
  hours: 'Hours',
  image: 'Photo',
  minyanim: 'Davening times',
  contacts: 'Contacts',
  number: 'Number',
}

/** The kind a field is, as the boards name it ("Choices"). */
export const fieldKind = (type: FieldType) => KIND[type]

const input = 'w-full min-h-12 rounded-[10px] border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 placeholder:text-slate-400'

export default function FieldScreen({
  field: f,
  pageName,
  canRequire,
  onChange,
  onBack,
  onKosherQuestions,
  partner,
  rows = false,
}: {
  field: CategoryField
  pageName: string
  /** Visitors can add or edit places, so "required" means something. */
  canRequire: boolean
  onChange: (patch: Partial<CategoryField>) => void
  onBack: () => void
  /** Turns a hechsher's questions on or off, with the page's hidden fields. */
  onKosherQuestions?: (on: boolean) => void
  /** The field that comes with it (fieldPartners.ts): on the page, and its switch. */
  partner?: PartnerSwitch
  /** The page lists its places on rows, so "Under the name" means something. */
  rows?: boolean
}) {
  if (!f.madeHere) return <ReadyFieldScreen field={f} pageName={pageName} canRequire={canRequire} onChange={onChange} onBack={onBack} onKosherQuestions={onKosherQuestions} partner={partner} rows={rows} />
  return <OwnFieldScreen field={f} pageName={pageName} canRequire={canRequire} onChange={onChange} onBack={onBack} rows={rows} />
}

type ScreenProps = Parameters<typeof FieldScreen>[0]

export type PartnerSwitch = { on: boolean; onChange: (on: boolean) => void }

/** The field's name and kind, as a screen's heading. */
export function FieldTitle({ field: f }: { field: CategoryField }) {
  return (
    <span className="inline-flex max-w-full items-center gap-3">
      <span className="truncate">{f.label || 'New field'}</span>
      <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-[3px] text-[13px] font-semibold text-slate-600">{fieldKind(f.type)}</span>
    </span>
  )
}

function ReadyFieldScreen({ field: f, pageName, canRequire, onChange, onBack, onKosherQuestions, partner, rows }: ScreenProps) {
  return (
    <>
      <AdminBack back={{ label: pageName, onClick: onBack }} title={<FieldTitle field={f} />} />
      <WhatThisIs field={f} partnerOn={!!partner?.on} />
      <FieldChanges field={f} canRequire={canRequire} onChange={onChange} onKosherQuestions={onKosherQuestions} partner={partner} rows={rows} />
    </>
  )
}

const chip = 'rounded-full bg-slate-100 px-3 py-1 text-[14px] font-semibold text-slate-700'

/** "A, B and C". */
const andList = (names: readonly string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/** The first box: what the field is, in a few sentences, and what it holds.
 *  Only its choices are chips, since those are what a place picks; what it
 *  comes with is a sentence in the paragraph (the user, Nov 9: "seems like
 *  a lot going on"). What keeps it up to date is a line of its own, its
 *  start in bold, saying how often (Nov 9: "pretty explicit on what it
 *  is"), with a way to learn what a watch is: How watches work, a screen
 *  of its own off Watches, so Back comes back here. */
export function WhatThisIs({ field, partnerOn = false }: { field: CategoryField; partnerOn?: boolean }) {
  const { about, choices, comesWith, watchedBy } = fieldAbout(field, { partnerOn })
  const community = useOptionalCommunitySlug()
  return (
    <AdminBox title="What this is">
      <div className="flex flex-col gap-3.5 p-4">
        <p className="m-0 text-[17px] leading-[1.55] text-slate-800">
          {about}
          {comesWith?.length ? ` It comes with ${andList(comesWith)}.` : null}
        </p>
        {watchedBy ? (
          <p className="m-0 text-[17px] leading-[1.55] text-slate-800" data-testid="watched">
            <strong className="font-semibold text-slate-900">Watched:</strong> {watchedBy}
            {community ? (
              <>
                {' '}
                <Link href={`${adminBase(community)}/watches/about`} className="font-semibold text-primary underline-offset-2 hover:underline">
                  How watches work
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {choices?.length ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-500">Choices</span>
            <ul aria-label="Choices" className="m-0 p-0 list-none flex flex-wrap gap-1.5">
              {choices.map((n) => (
                <li key={n} className={chip}>
                  {n}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </AdminBox>
  )
}

const NEVER_REQUIRED: ReadonlySet<FieldType> = new Set(['image', 'tags', 'contacts', 'minyanim'])

const changeRow = 'flex min-h-[60px] items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0'

function Change({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className={changeRow}>
      <span className="flex flex-1 min-w-0 flex-col">
        <span className="text-[15px] font-semibold text-slate-900">{label}</span>
        <span className="text-[13px] text-slate-600">{hint}</span>
      </span>
      {children}
    </div>
  )
}

/** The second box: the few things a page sets on a ready-made field, each
 *  shown at its setting, so what you'd get is plain before you touch it.
 *  With `fixed`, nothing (a page's basics). */
export function FieldChanges({
  field: f,
  canRequire,
  onChange,
  fixed = false,
  onKosherQuestions,
  partner,
  rows = false,
}: {
  field: CategoryField
  canRequire: boolean
  onChange: (patch: Partial<CategoryField>) => void
  fixed?: boolean
  /** Added already: the page's hidden fields change with it. Before adding,
   *  the caveat alone, and adding brings its questions. */
  onKosherQuestions?: (on: boolean) => void
  /** The field that comes with it, when it has one. */
  partner?: PartnerSwitch
  /** The page lists its places on rows: "Under the name" is offered. */
  rows?: boolean
}) {
  // A photo, a list, contacts or davening times aren't a thing a place can't
  // do without. A yes or no can be required (the user, Nov 8): it starts
  // unanswered, so required means someone picks Yes or No.
  const required = !fixed && canRequire && !NEVER_REQUIRED.has(f.type)
  const filter = !fixed && TYPE_IS_FILTERABLE(f.type)
  const rules = fieldRules(f)
  const choices = !fixed && f.type === 'select' && !!rules.choicesEditable
  const kosher = !fixed && !!rules.asksEverythingKosher
  const partnerSays = !fixed && partner ? partnerRule(f) : undefined
  const minyan = !fixed && f.type === 'minyanim'
  const under = !fixed && rows && canGoUnderName(f)
  const off = f.minyanOff ?? []
  return (
    <>
      <AdminBox title="What you can change">
        {!required && !filter && !under && !kosher && !partnerSays && !minyan && <p className="m-0 px-4 py-3 text-[15px] text-slate-600">Nothing. It works the same on every page.</p>}
        {required && (
          <Change label="Required" hint="A place can’t be added without it">
            <AdminSwitch checked={!!f.required} onChange={(on) => onChange({ required: on })} label="Required" />
          </Change>
        )}
        {filter && (
          <Change
            label={f.type === 'hours' ? '“Open now” in the filter' : 'In the filter'}
            hint={f.type === 'hours' ? 'Visitors can show only places open now' : 'Visitors can narrow the list by it'}
          >
            <AdminSwitch
              checked={!!f.filterable}
              // A choice in the filter shows at the top of a place, as a chip.
              onChange={(on) => onChange(on && (f.type === 'select' || f.type === 'boolean') ? { filterable: true, renderAs: 'badge' } : { filterable: on })}
              label={f.type === 'hours' ? 'Open now in the filter' : 'In the filter'}
            />
          </Change>
        )}
        {under && (
          <Change label="Under the name" hint="Shows on its row in the list">
            <AdminSwitch checked={underName(f)} onChange={(on) => onChange(cardPatch(f, on))} label="Under the name" />
          </Change>
        )}
        {kosher && (
          <Change label="Everything here is kosher?" hint="Asks whether anything at a place isn’t kosher">
            <AdminSwitch
              checked={!!f.caveat}
              onChange={(on) => (onKosherQuestions ? onKosherQuestions(on) : onChange({ caveat: on ? { ...KOSHER_CAVEAT } : undefined }))}
              label="Everything here is kosher?"
            />
          </Change>
        )}
        {partnerSays && partner && (
          <Change label={partnerSays.name} hint={partnerSays.hint}>
            <AdminSwitch checked={partner.on} onChange={partner.onChange} label={partnerSays.name} />
          </Change>
        )}
        {minyan &&
          MINYAN_PARTS.map(({ part, label, hint }) => (
            <Change key={part} label={label} hint={hint}>
              <AdminSwitch
                checked={!off.includes(part)}
                onChange={(on) => {
                  const next = on ? off.filter((p) => p !== part) : [...off, part]
                  onChange({ minyanOff: next.length ? next : undefined })
                }}
                label={label}
              />
            </Change>
          ))}
      </AdminBox>
      {choices && <ChoiceList field={f} onChange={onChange} markOwn />}
    </>
  )
}

function OwnFieldScreen({ field: f, pageName, canRequire, onChange, onBack, rows }: ScreenProps) {
  // A new field's key follows its name until the name is left, then never
  // changes, so a rename never strands its answers (CategoryFieldEditor's
  // keyFrozenRef has the history).
  const keyFrozen = useRef(!!f.key)
  const choices = f.type === 'select' || (f.type === 'tags' && f.fixedVocabulary)
  const options = f.options ?? []
  const both = options.length >= 2 ? `Can a place be both ${options[0].label} and ${options[1].label}?` : 'Can a place have more than one?'
  // A choice in the filter shows at the top of a place, as a chip.
  const filter = (yes: boolean) => onChange(yes && (f.type === 'select' || f.type === 'boolean') ? { filterable: true, renderAs: 'badge' } : { filterable: yes })

  return (
    <>
      <AdminBack back={{ label: pageName, onClick: onBack }} title={<FieldTitle field={f} />} />
      <AdminBox title="Basics">
        <div className="flex flex-col gap-4 px-4 pb-4">
          <AdminField label="Name">
            <input
              value={f.label}
              onChange={(e) => onChange(keyFrozen.current ? { label: e.target.value } : { label: e.target.value, key: slugifyFieldKey(e.target.value) })}
              onBlur={() => (keyFrozen.current = true)}
              placeholder="New field"
              className={input}
            />
          </AdminField>
          {f.type !== 'image' && (
            <AdminField label="Note under it, on Add a place">
              <input
                value={f.help ?? f.placeholder ?? ''}
                onChange={(e) => onChange({ help: e.target.value || undefined, placeholder: undefined })}
                className={input}
              />
            </AdminField>
          )}
          {f.type === 'url' && (
            <AdminField label="What should the button say?">
              <input value={f.linkLabel ?? ''} onChange={(e) => onChange({ linkLabel: e.target.value || undefined })} placeholder="Open the link" className={input} />
            </AdminField>
          )}
        </div>
      </AdminBox>
      {choices && <ChoiceList field={f} onChange={onChange} />}
      {(canRequire && f.type !== 'boolean' && f.type !== 'image') || TYPE_IS_FILTERABLE(f.type) || f.type === 'select' || (rows && canGoUnderName(f)) ? (
        <AdminBox title="Questions">
          {canRequire && f.type !== 'boolean' && f.type !== 'image' && (
            <AdminYesNo question="Is it a required field?" value={!!f.required} onChange={(yes) => onChange({ required: yes })} />
          )}
          {TYPE_IS_FILTERABLE(f.type) && (
            <AdminYesNo question={f.type === 'hours' ? 'Should “Open now” be part of the filter?' : 'Should it be part of the filter?'} value={!!f.filterable} onChange={filter} />
          )}
          {rows && canGoUnderName(f) && <AdminYesNo question="Show it under the name?" value={underName(f)} onChange={(yes) => onChange(cardPatch(f, yes))} />}
          {f.type === 'select' && <AdminYesNo question={both} value={!!f.multiSelect} onChange={(yes) => onChange({ multiSelect: yes })} />}
        </AdminBox>
      ) : null}
    </>
  )
}
