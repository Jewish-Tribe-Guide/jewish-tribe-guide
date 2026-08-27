'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  /** HTML — see lib/richText.ts. The caller is responsible for converting a
   *  legacy plain-text body before passing it in (pageBodyToHtml does that). */
  value: string
  onChange: (html: string) => void
  ariaLabel: string
  rows?: number
}

type Command = { id: string; label: string; title: string; command: string; arg?: string; className?: string }

// document.execCommand is formally deprecated and just as formally not going
// anywhere: it is the only API every browser implements for "apply bold to the
// selection in a contenteditable", and the replacements people reach for
// instead (ProseMirror, Slate, Lexical, TipTap) are 100–300 KB of dependency
// for an admin screen that edits two pages of prose. The commands used here
// are the boring, universally-supported ones.
const COMMANDS: Command[] = [
  { id: 'bold', label: 'B', title: 'Bold (⌘B)', command: 'bold', className: 'font-bold' },
  { id: 'italic', label: 'I', title: 'Italic (⌘I)', command: 'italic', className: 'italic font-serif' },
  { id: 'underline', label: 'U', title: 'Underline (⌘U)', command: 'underline', className: 'underline' },
  { id: 'strikeThrough', label: 'S', title: 'Strikethrough', command: 'strikeThrough', className: 'line-through' },
  { id: 'h2', label: 'H2', title: 'Heading', command: 'formatBlock', arg: 'h2' },
  { id: 'h3', label: 'H3', title: 'Subheading', command: 'formatBlock', arg: 'h3' },
  { id: 'insertUnorderedList', label: '• List', title: 'Bulleted list', command: 'insertUnorderedList' },
  { id: 'insertOrderedList', label: '1. List', title: 'Numbered list', command: 'insertOrderedList' },
]

/** A small WYSIWYG for admin-editable page copy — bold/italic/underline,
 *  headings, lists and links, over a contenteditable div.
 *
 *  Deliberately *not* sanitizing on every keystroke: rewriting innerHTML while
 *  someone is typing in it moves their caret to the start of the field. The
 *  editor keeps whatever the browser produced, and sanitizing happens once on
 *  save — in the caller, and again server-side in the PATCH route, which is
 *  where it has to happen anyway since nothing client-side is trustworthy. */
export default function RichTextEditor({ value, onChange, ariaLabel, rows = 16 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // The last HTML this component emitted. Anything arriving in `value` that
  // doesn't match it came from outside (a page switch, a Cancel) and has to be
  // written into the DOM; an echo of our own onChange must not be, or every
  // keystroke would reset the caret — the same reason we don't sanitize here.
  const lastEmitted = useRef<string | null>(null)
  const [active, setActive] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const el = ref.current
    if (!el || value === lastEmitted.current) return
    el.innerHTML = value
    lastEmitted.current = value
  }, [value])

  const emit = useCallback(() => {
    const html = ref.current?.innerHTML ?? ''
    lastEmitted.current = html
    onChange(html)
  }, [onChange])

  // Which buttons render as pressed. Recomputed on selection change rather
  // than on input: moving the caret into existing bold text has to light the
  // B up too, and that fires no input event.
  const syncActive = useCallback(() => {
    const el = ref.current
    if (!el || !el.contains(document.getSelection()?.anchorNode ?? null)) return
    const next: Record<string, boolean> = {}
    for (const c of COMMANDS) {
      try {
        next[c.id] = c.command === 'formatBlock'
          ? document.queryCommandValue('formatBlock').toLowerCase() === c.arg
          : document.queryCommandState(c.command)
      } catch {
        // queryCommandState throws rather than returning false for an
        // unsupported command in some browsers; an unlit button is a fine
        // outcome, a crashed admin console is not.
        next[c.id] = false
      }
    }
    setActive(next)
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', syncActive)
    return () => document.removeEventListener('selectionchange', syncActive)
  }, [syncActive])

  function run(command: string, arg?: string) {
    ref.current?.focus()
    try {
      // styleWithCSS off asks for <strong>/<em> tags rather than
      // <span style="font-weight:bold">, which the sanitizer would strip back
      // to unformatted text — the formatting would visibly vanish on save.
      document.execCommand('styleWithCSS', false, 'false')
    } catch {
      // Firefox has thrown here historically; the format command below still
      // works, it just may produce styled spans instead of tags.
    }
    document.execCommand(command, false, arg)
    emit()
    syncActive()
  }

  function addLink() {
    const selection = document.getSelection()
    if (!selection || selection.isCollapsed || !ref.current?.contains(selection.anchorNode)) {
      window.alert('Select the words you want to link first.')
      return
    }
    const url = window.prompt('Link to:', 'https://')
    if (url === null) return
    // Empty input reads as "remove this link" rather than as a link to
    // nowhere — it's the only affordance for unlinking, and typing nothing is
    // what someone reaches for.
    run(url.trim() ? 'createLink' : 'unlink', url.trim() || undefined)
  }

  const buttonClass = (on: boolean) =>
    `min-w-8 px-2 py-1 text-xs rounded transition-colors cursor-pointer ${
      on ? 'bg-primary text-white' : 'text-slate-700 hover:bg-slate-100'
    }`

  return (
    <div className="rounded-md border border-slate-300 focus-within:ring-2 focus-within:ring-primary">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 p-1" role="toolbar" aria-label={`${ariaLabel} formatting`}>
        {COMMANDS.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.title}
            aria-label={c.title}
            aria-pressed={!!active[c.id]}
            // The toolbar must not take focus: the selection in the editor is
            // what execCommand acts on, and clicking a button that steals
            // focus collapses it first.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(c.command, c.arg)}
            className={`${buttonClass(!!active[c.id])} ${c.className ?? ''}`}
          >
            {c.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />
        <button type="button" title="Link" aria-label="Link" onMouseDown={(e) => e.preventDefault()} onClick={addLink} className={buttonClass(false)}>
          Link
        </button>
        <button
          type="button"
          title="Clear formatting"
          aria-label="Clear formatting"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run('removeFormat')}
          className={buttonClass(false)}
        >
          Clear
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        onInput={emit}
        // A paste carries the source page's entire style tree. Taking the
        // plain text and letting the toolbar re-apply formatting is both what
        // the sanitizer would end up with anyway and far less surprising than
        // pasting a paragraph that silently keeps someone else's font.
        onPaste={(e) => {
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
          emit()
        }}
        className="rich-text w-full overflow-y-auto px-3 py-2 text-sm text-slate-900 focus:outline-none"
        style={{ minHeight: `${rows * 1.5}rem`, maxHeight: '60vh' }}
      />
    </div>
  )
}
