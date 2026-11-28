"use client";

import type { ReactNode } from "react";
import { CloseIcon, PencilIcon, RefreshIcon } from "@/components/icons";
import HoverLabel from "./HoverLabel";

// A source's actions as icons (boards L2h, L2i, Nov 28): grey and always
// there, darkened in a circle on hover and named by HoverLabel. Remove's
// circle is red. The same glyphs as the phone's swipe circles.

export type IconActionKind = "read" | "edit" | "remove";

const GLYPH: Record<IconActionKind, ReactNode> = {
  read: <RefreshIcon className="h-4 w-4" />,
  edit: <PencilIcon className="h-4 w-4" />,
  remove: <CloseIcon className="h-4 w-4" />,
};

const WORD: Record<IconActionKind, string> = {
  read: "Read now",
  edit: "Edit",
  remove: "Remove",
};

export default function IconAction({
  kind,
  of,
  onClick,
  disabled,
  label,
}: {
  kind: IconActionKind;
  of?: string;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const word = label ?? WORD[kind];
  const tone =
    kind === "remove"
      ? "hover:bg-red-50 hover:text-red-700 focus-visible:bg-red-50 focus-visible:text-red-700"
      : "hover:bg-slate-200 hover:text-slate-900 focus-visible:bg-slate-200 focus-visible:text-slate-900";
  return (
    <HoverLabel label={word}>
      <button
        type="button"
        aria-label={of ? `${word} ${of}` : word}
        disabled={disabled}
        onClick={onClick}
        data-action={kind}
        className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 transition-colors disabled:cursor-default disabled:opacity-50 ${tone}`}
      >
        {GLYPH[kind]}
      </button>
    </HoverLabel>
  );
}
