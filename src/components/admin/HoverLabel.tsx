"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// ── A control's name, shown on hover (Nov 28) ─────────────────────────────
// The browser's own label (`title`) waits about a second, longer in Safari,
// and never shows for the keyboard (the user: "sometimes your hovers take a
// long time"). This one shows after HOVER_DELAY_MS, at once while another
// has just shown (moving along a row of icons reads them one by one), and on
// keyboard focus. A touch shows nothing: there is no hover on a phone, and a
// tap is the action itself.
//
// The label is drawn in a portal, fixed under the control, so a box with
// overflow hidden (a card, a swipe row) can't cut it off. It is aria-hidden:
// the control's own aria-label is its name for a screen reader.

export const HOVER_DELAY_MS = 150;
/** How long after one label hides the next shows at once. */
export const WARM_MS = 400;

let warmUntil = 0;

/** For tests: a fresh page, no label shown a moment ago. */
export function forgetHoverLabels() {
  warmUntil = 0;
}

function focusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return false;
  }
}

/** `wide`: a sentence, wrapped, rather than a control's name on one line. */
export default function HoverLabel({
  label,
  children,
  className = "inline-flex",
  wide,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function place() {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAt({ x: r.left + r.width / 2, y: r.bottom + 6 });
  }
  function show() {
    if (timer.current) clearTimeout(timer.current);
    if (Date.now() < warmUntil) return place();
    timer.current = setTimeout(place, HOVER_DELAY_MS);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAt((was) => {
      if (was) warmUntil = Date.now() + WARM_MS;
      return null;
    });
  }

  return (
    <span
      ref={ref}
      className={className}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") show();
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(e) => {
        if (focusVisible(e.target)) show();
      }}
      onBlur={hide}
    >
      {children}
      {at &&
        createPortal(
          <span
            aria-hidden="true"
            data-testid="hover-label"
            className={`pointer-events-none fixed z-[1000] -translate-x-1/2 ${wide ? "w-64 whitespace-normal" : "whitespace-nowrap"} rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white shadow`}
            style={{ left: at.x, top: at.y }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
