'use client'

import { useState } from 'react'
import { DEFAULT_CATEGORY_ICON } from '@/lib/categories'
import { Card as HomeCard, TINTS } from '@/components/home/sections'
import ImageUploadField from '@/components/ImageUploadField'

// ── Shared form-field building blocks used by CategoryEditor and
// SingletonEditor (in CategoryManager.tsx), and by FormEditor. ──

export const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary'

// A starter palette for the icon picker — common, recognizable choices for a
// community directory, grouped for scanability. Not exhaustive: the text
// field next to it accepts any emoji, so this is a shortcut, not a limit.
const ICON_CHOICES: { group: string; options: { emoji: string; label: string }[] }[] = [
  {
    group: 'Places',
    options: [
      { emoji: '🏫', label: 'School' },
      { emoji: '🏥', label: 'Hospital' },
      { emoji: '🏨', label: 'Hotel' },
      { emoji: '🏠', label: 'House' },
      { emoji: '🏢', label: 'Building' },
      { emoji: '🕍', label: 'Synagogue' },
      { emoji: '💧', label: 'Water drop' },
      { emoji: '🏦', label: 'Bank' },
      { emoji: '📚', label: 'Library' },
    ],
  },
  {
    group: 'Food & shopping',
    options: [
      { emoji: '🍽️', label: 'Restaurant' },
      { emoji: '🛒', label: 'Grocery cart' },
      { emoji: '☕', label: 'Cafe' },
      { emoji: '🍞', label: 'Bakery' },
      { emoji: '🛍️', label: 'Shopping' },
    ],
  },
  {
    group: 'People & community',
    options: [
      { emoji: '🧑‍🤝‍🧑', label: 'People' },
      { emoji: '🤝', label: 'Handshake' },
      { emoji: '💛', label: 'Heart' },
      { emoji: '👶', label: 'Childcare' },
      { emoji: '🙏', label: 'Prayer' },
    ],
  },
  {
    group: 'Symbols & info',
    options: [
      { emoji: '✡️', label: 'Star of David' },
      { emoji: '🕯️', label: 'Candle' },
      { emoji: '🗺️', label: 'Map' },
      { emoji: '💬', label: 'Chat' },
      { emoji: '📅', label: 'Calendar' },
      { emoji: '☎️', label: 'Phone' },
      { emoji: '🌐', label: 'Website' },
      { emoji: '📋', label: 'Clipboard (default)' },
    ],
  },
]

// The emoji field + curated browse panel, plus (when the caller wires up
// upload support) an image alternative — shared by the full category editor
// and SingletonEditor (Map/Zmanim/Eruv), which has nothing else to edit.
export function IconField({
  icon,
  onChange,
  iconImageUrl,
  onIconImageUrl,
  token,
}: {
  icon: string
  onChange: (value: string) => void
  /** When both this and `onIconImageUrl`/`token` are provided, an "or upload
   *  a picture" option renders below the emoji picker — omitted by any
   *  caller that hasn't wired up image storage for its icon (there are
   *  none today, but this keeps the emoji-only path available without a
   *  required prop every call site has to pass). */
  iconImageUrl?: string
  onIconImageUrl?: (url: string) => void
  token?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    // A <div>, not <label> — an image URL text input renders inside this
    // (see the ImageUploadField block below) with its own <label>, and
    // labels can't nest. The emoji <input> below carries its own
    // aria-label="Icon" instead of relying on an ancestor <label> for that.
    <div className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">Icon</span>
      <div className="flex gap-2">
        {/* inputClass bakes in w-full — wrap it rather than adding a competing
            w-16 to the same className, which Tailwind doesn't resolve by
            source order and would silently lose to w-full. */}
        <div className="w-16 shrink-0">
          <input
            value={icon}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} text-center text-lg`}
            placeholder={DEFAULT_CATEGORY_ICON}
            maxLength={4}
            aria-label="Icon"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-sm font-medium border border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          {open ? 'Hide icons' : 'Browse icons…'}
        </button>
      </div>
      {/* A plain scrolling div, not a native <select> — the browser's own
          dropdown popup can't be restyled (comes out cramped regardless of
          how the closed control is sized) and its built-in overflow arrows
          only scroll one direction at a time. This scrolls like any other
          page content. */}
      {open && (
        <div className="mt-2 border border-slate-200 rounded-md p-2 max-h-52 overflow-y-auto space-y-2 bg-slate-50/60">
          {ICON_CHOICES.map((group) => (
            <div key={group.group}>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                {group.group}
              </span>
              <div className="flex flex-wrap gap-1">
                {group.options.map((o) => (
                  <button
                    key={o.emoji}
                    type="button"
                    onClick={() => { onChange(o.emoji); setOpen(false) }}
                    title={o.label}
                    className={`text-lg leading-none rounded-md px-2 py-1.5 transition-colors cursor-pointer ${
                      icon === o.emoji ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-white'
                    }`}
                  >
                    {o.emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <span className="block text-[11px] text-muted mt-1">
        Browse a curated list, or type/paste any emoji directly into the box. Used as the map
        marker, and as the card icon if no background photo is set.
      </span>

      {onIconImageUrl && token !== undefined && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <span className="block text-xs font-medium text-slate-700 mb-1">Or use a picture instead</span>
          <ImageUploadField
            value={iconImageUrl ?? ''}
            onChange={onIconImageUrl}
            uploadUrl="/api/admin/categories/icon"
            token={token}
            helpText="Replaces the emoji above everywhere this category's icon shows — listing rows, map pins, the nearby list. Clear it to go back to the emoji."
          />
        </div>
      )}
    </div>
  )
}

// The image-URL + text-color fields + live preview — shared by the full
// category editor and SingletonEditor.
export function CardBackgroundField({
  cardImageUrl,
  onCardImageUrl,
  cardTextColor,
  onCardTextColor,
  previewIcon,
  previewTitle,
}: {
  cardImageUrl: string
  onCardImageUrl: (value: string) => void
  cardTextColor: string
  onCardTextColor: (value: string) => void
  previewIcon: string
  previewTitle: string
}) {
  return (
    <div className="pt-1">
      <span className="block text-xs font-medium text-slate-700 mb-1">Home-screen card background (optional)</span>
      <div className="flex gap-3">
        <div className="flex-1 space-y-2">
          <input
            value={cardImageUrl}
            onChange={(e) => onCardImageUrl(e.target.value)}
            className={inputClass}
            placeholder="https://… (a photo instead of the flat tint)"
          />
          {cardImageUrl.trim() && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <span className="text-xs font-medium text-slate-700">Text color</span>
              <input
                type="color"
                value={cardTextColor}
                onChange={(e) => onCardTextColor(e.target.value)}
                className="h-8 w-14 rounded border border-slate-300 cursor-pointer"
              />
            </label>
          )}
          <span className="block text-[11px] text-muted">
            A pasted image URL, not an upload. A dark gradient is applied automatically so the
            title stays readable — the icon above stops showing once a photo is set (an emoji over
            a photo doesn&rsquo;t read as a clean icon). The color picker only affects the title
            text, not the photo.
          </span>
        </div>
        {/* A live preview using the exact same Card the home screen renders,
            so what's shown here is what visitors will see. */}
        <div className="w-32 shrink-0">
          <HomeCard
            card={{
              title: previewTitle,
              icon: previewIcon || undefined,
              cardImageUrl: cardImageUrl.trim() || null,
              cardTextColor: cardImageUrl.trim() ? cardTextColor : null,
              go: () => {},
            }}
            tint={TINTS[0]}
          />
        </div>
      </div>
    </div>
  )
}
