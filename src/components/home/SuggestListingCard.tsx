'use client'

import { useState } from 'react'
import ContributePicker from './ContributePicker'
import { HOME_CARD_OUTLINE, LIFT_ON_HOVER, SIGN_OFF_BUTTON, SIGN_OFF_CARD, SIGN_OFF_EYEBROW, SIGN_OFF_HEADING, SIGN_OFF_LINE } from './AnswerCard'

// ── Suggest a Listing, on its own after the map (board G5b, Nov 11) ─────────
// The turn from using the guide to adding to it, so it stands alone rather
// than sharing a row with the times: a heading, one line and one button,
// with no photo (the user: "maybe the davening times and candles and stuff
// don't need pictures"). The button opens the same picker as the "+ Add"
// button, so a visitor chooses what to add before any form. The whole card
// lifts on hover and opens it, like the other computer-home cards (Nov 14);
// the button stays for the keyboard.
/** `line={false}`: the eyebrow, heading and button alone (What changed's
 *  side card, board W11). */
export default function SuggestListingCard({ line = true }: { line?: boolean } = {}) {
  const [open, setOpen] = useState(false)

  return (
    // Board W7l (the user, Nov 15): quieter than it was, so the map above
    // stays the bigger thing and this reads as the page's sign-off: a small
    // heading and a small button, beside the words once the card is 540px
    // wide, under them below that (sized by its own width, not the
    // window's, Nov 12).
    <div className="@container h-full">
    <div
      data-testid="home-suggest"
      onClick={() => setOpen(true)}
      className={`${SIGN_OFF_CARD} ${LIFT_ON_HOVER} cursor-pointer ${HOME_CARD_OUTLINE}`}>
      <div className="min-w-0 @[540px]:flex-1">
        <p className={SIGN_OFF_EYEBROW}>Kept up by the community</p>
        <h3 className={SIGN_OFF_HEADING}>Know a place we’re missing?</h3>
        {line && <p className={SIGN_OFF_LINE}>Add it, or fix one that’s out of date. A person checks every change.</p>}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={SIGN_OFF_BUTTON}
      >
        Suggest a listing
      </button>
    </div>
    {/* Outside the card, so a click in the picker never reaches the card's own. */}
    {open && <ContributePicker onClose={() => setOpen(false)} />}
    </div>
  )
}
