"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./Button";

// The one overlay in the app. Every detail view and form (a day, an event, a
// recipe, a color, the people picker) opens the same way: a sheet of paper that
// rises from the bottom of a phone and sits centered on a wide screen, over a
// dimmed scene that closes it. Escape closes it too. The body scrolls inside
// the sheet; the page behind never moves.
//
// A sheet is `.paper`: everything inside reads the paper values of the
// contextual tokens (dark text by day, slate in the evening).

const WIDTHS = {
  sm: "wide:w-[28rem]",
  md: "wide:w-[38rem]",
  lg: "wide:w-[48rem]",
  xl: "wide:w-[64rem]",
} as const;

export function Sheet({
  label,
  onClose,
  size = "md",
  children,
}: {
  /** The dialog's accessible name. */
  label: string;
  onClose: () => void;
  size?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center wide:items-center wide:p-8"
      role="presentation"
    >
      <div
        className="absolute inset-0 animate-fade bg-scrim backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`paper relative flex max-h-[92dvh] w-full animate-rise flex-col overflow-hidden rounded-t-[2rem] shadow-float wide:max-h-full wide:max-w-full wide:rounded-[2rem] ${WIDTHS[size]}`}
      >
        {children}
      </div>
    </div>
  );
}

/** The sheet's title row: an optional leading control, the title, and Close. */
export function SheetHeader({
  title,
  subtitle,
  leading,
  actions,
  onClose,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-5 wide:px-7 wide:pt-6">
      {leading}
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-big font-medium leading-tight text-fg">{title}</h2>
        {subtitle && <p className="mt-1 text-small text-fg-soft">{subtitle}</p>}
      </div>
      {actions}
      <IconButton label="Close" variant="secondary" onClick={onClose} className="-mr-1 -mt-1">
        <X className="size-6" strokeWidth={2.25} aria-hidden />
      </IconButton>
    </div>
  );
}

/** The scrolling middle of a sheet. */
export function SheetBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-h-0 flex-1 overflow-y-auto px-5 py-4 wide:px-7 wide:py-5 ${className}`}>
      {children}
    </div>
  );
}

/** The pinned action row at the bottom of a sheet. */
export function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 border-t border-line bg-fill px-5 py-4 pb-safe wide:px-7">
      <div className="flex items-center gap-3 pb-1">{children}</div>
    </div>
  );
}
