# How we work

How the user likes Claude to work on this project, learned over Aug–Nov 2026.
Until Nov 9 it lived only in one Claude account's notes. It is here so it
carries over to any account, and `CLAUDE.md` loads it every session. The
project rules (production writes, tests, caching) are in `AGENTS.md`. Open
work is in `docs/where-things-stand.md`.

## Talking with the user

- **A question is not an instruction.** The user reviews by asking ("should
  location be in the header?"). Answer with your own view and a
  recommendation, and disagree when you think they're wrong. Don't redraw or
  rebuild in answer to a question, and never record one as a decision. A
  decision is something they said yes to.
- **Look before claiming.** Open the screen or read the code before saying
  how something works today, or drawing an edit of it. Say what you checked
  and what you're going from memory on. Never imply you watched another app
  (iMessage, WhatsApp) if you only reasoned about it.
- **Check PR state first.** The user merges as soon as CI is green, often
  while you're working. Run `gh pr view <n> --json state` and
  `git log origin/main..HEAD` before saying a PR is open or what ships in it.
- **Say what is drawn only.** When some things were built and others only
  drawn, end with a plain list of the drawn-only ones, named by what the user
  would see on the site, and "not built until you OK it".
- **Don't ask between steps.** Once a multi-step build is approved, test,
  commit and push each step and carry on, then report once at the end. Still
  stop for production writes and for design calls the drawings don't settle.
- They/them for anyone whose pronouns you don't know.

## Git

- Commit finished, verified work without being asked, and push the branch
  after. Never force-push. Merge commits only.
- Stack work on one line: the current working branch
  (`redesign/oct18-fixes` as of Nov 9), or a new branch from its tip. Never a
  sibling branch off an older commit.
- Before opening a PR, `git fetch && git merge origin/main` and push. Main
  requires branches to be up to date, and the user chose (Oct 18) to keep
  that rule.
- Bugs found along the way are fixed with a test and listed in the tracker,
  not shipped as separate one-offs.
- The user tries pushed work on the commit's Vercel preview, on their phone.
  The preview reads the dev database. If a change "isn't showing", check the
  deploy finished and that the tab wasn't opened before it.

## Design rules

- **Simple and findable over elaborate.** The user's words: "my main goal is
  to have the website be navigatable… I'd rather keep it simple so that
  people can find what they need."
- **Less reading, one task per screen.** "Reading is thinking and slowing
  down." An explaining sentence means the screen needs fixing. This holds on
  admin screens too: a card is its heading, the facts, and its buttons.
- **No clutter links.** No buttons or links under cards. The card itself is
  tappable (chevron). A row is the name, the answer, and when it was checked.
  Details live in the listing.
- **Whole-text links.** A link is one action phrase ("Fill it in yourself"),
  not a question with a clickable tail.
- **No emoji as icons.** They read as "childish, cheap, and more AI obvious".
  Use the site's line glyphs (`src/lib/categoryIcons.tsx`), photos and logos.
- **Show the contributor the end result.** They see the listing as it will
  look, with light marks on what changed, and Send. The diff and the logic go
  to the admin.
- **Ready-made first, the same everywhere.** Admin setup leads with what the
  site already has (search and a list), and "make your own" comes second.
  Communities shouldn't look different to visitors.
- **Every screen of its own has an address**, through Next's router, so Back,
  Forward and reload work (see `AGENTS.md`). The user has hit this more than
  once. Prove it in a real browser.
- **Usual times and a week are separate.** A dated week is never compared
  with, matched to, or filled from a shul's usual times, and never borrows
  their notes, sign-up group or join link.
- **Watch everything that's out there, cheaply.** Every field needs
  something keeping it current. Google keeps what it owns on a listing
  (`details.googleFields`), and the website watch checks the rest. Address
  isn't checked. Don't cut a field over misread risk, because an admin
  approves every finding.

## AI features

Trust is the site's whole value. The user: "we don't need to be 100%
perfect, but we need to not confidently say something that's wrong."

1. Every answer names its source and date.
2. The AI never supplies a fact. It reads the question, and the listings
   answer. When we don't have it, say so and offer to ask or add.
3. Show how the question was read, as removable tags.
4. What the AI proposes stays a proposal until a person approves it.
5. "Confirmed" only ever means a person confirmed it.

The AI never overrides what our own parser is sure of. When unsure, offer
the narrower or wider reading rather than applying it silently.

## Drawings

- Before showing a design, check it against the decisions and include the
  result:
  - the search box first
  - scrolling alone reaches an answer
  - answer, don't list
  - visible trust (when and where each fact came from)
  - contributing is cheap
  - time-aware (Friday is Shabbos prep)
  - honest with sparse data
  - admin-editable and multi-community, with no one-category code
  - pages for browsing and sheets for moments

  Name any change to an earlier decision as a change.
- When building from a drawing, screenshot each built screen beside its
  board, on desktop and phone, before calling it built. Reusing an old screen
  inside a new frame is not following the drawing.
- A board's look is part of the drawing. When the user approves a board,
  build what it shows, its buttons and boxes included, not just its
  arrangement. Don't assume the screen should keep today's look (Nov 10,
  E1b: "I like the creativity. I just want you to implement it"). Name
  any visual change the board makes when showing it.
- When revising a drawing the user has seen, add a new board rather than
  overwriting it. Take settled or built boards off the canvas.
- Measure a board's height from a real render (headless Playwright on the
  `file://` board) rather than guessing. Guessed sizes cut drawings off.

## Testing habits

- Anything positional (hit-testing, scroll, gestures, overlap) is checked in
  a real browser (`e2e/`). jsdom has no layout.
- Two sessions running the `TEST_SUPABASE_*` suites at once share port 3213
  and the test database. Check for another run first.
