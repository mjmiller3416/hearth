"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Backpack,
  CalendarDays,
  Check,
  CookingPot,
  Flame,
  House,
  ListChecks,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { NAV, type NavId } from "@/lib/config";
import { useTimeZone } from "@/components/common/TimeZone";
import { useClock } from "@/hooks/useNow";
import { HeaderCountdown } from "@/components/layout/HeaderCountdown";
import { Avatar, FamilyAvatar, tint } from "@/components/ui/Avatar";
import { Sheet, SheetBody, SheetHeader } from "@/components/ui/Sheet";
import { useHousehold } from "./Household";

// The frame around every screen.
//
//   wide   a rail of destinations on the left; a header with the clock, the
//          next countdown and the lens; the page fills the rest and scrolls
//          inside its own panels (a wall never page-scrolls).
//   phone  a slim top bar (date, lens, settings), the page scrolling beneath,
//          and the same five destinations as a tab bar under the thumb.
//
// The lens ("who's looking") lives here because it applies to every screen.

const ICONS: Record<NavId, LucideIcon> = {
  today: House,
  calendar: CalendarDays,
  school: Backpack,
  chores: ListChecks,
  kitchen: CookingPot,
};

function useIsActive(): (href: string) => boolean {
  const pathname = usePathname();
  return (href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
}

// ── Lens ────────────────────────────────────────────────────────────────────

function LensChip({
  active,
  color,
  label,
  avatar,
  onClick,
}: {
  active: boolean;
  /** Palette slug, or null for the neutral "Everyone" chip. */
  color: string | null;
  label: string;
  avatar: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-4 text-label font-semibold leading-none transition-colors ${
        active ? "text-ink" : "text-ink-soft"
      }`}
      style={{
        backgroundColor: active
          ? color
            ? tint(color, 30)
            : "var(--color-surface)"
          : "transparent",
        boxShadow: active
          ? `inset 0 0 0 2px ${color ? `var(--color-${color})` : "var(--color-ink)"}`
          : "inset 0 0 0 1px var(--color-hairline-strong)",
      }}
    >
      {avatar}
      {label}
    </button>
  );
}

/** The row of people on the wide header. Tapping the active person clears it. */
function LensStrip() {
  const { members, lens, setLens } = useHousehold();
  if (members.length === 0) return null;
  return (
    <div className="scroll-strip flex min-w-0 items-center gap-2" role="group" aria-label="Who's looking">
      <LensChip
        active={lens === null}
        color={null}
        label="Everyone"
        avatar={<FamilyAvatar size="sm" />}
        onClick={() => setLens(null)}
      />
      {members.map((m) => (
        <LensChip
          key={m.key}
          active={lens?.key === m.key}
          color={m.color}
          label={m.name}
          avatar={<Avatar name={m.name} color={m.color} size="sm" />}
          onClick={() => setLens(lens?.key === m.key ? null : m.key)}
        />
      ))}
    </div>
  );
}

/** The lens on a phone: one button showing who's selected, opening a picker. */
function LensButton() {
  const { members, lens, setLens } = useHousehold();
  const [open, setOpen] = useState(false);
  if (members.length === 0) return null;

  const choose = (key: string | null) => {
    setLens(key);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Who's looking: ${lens?.name ?? "Everyone"}. Change`}
        className="flex min-h-11 items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3.5 text-label font-semibold text-ink shadow-card ring-1 ring-hairline"
      >
        {lens ? <Avatar name={lens.name} color={lens.color} size="sm" /> : <FamilyAvatar size="sm" />}
        {lens?.name ?? "Everyone"}
      </button>

      {open && (
        <Sheet label="Who's looking" onClose={() => setOpen(false)} size="sm">
          <SheetHeader
            title="Who's looking?"
            subtitle="Pick yourself to see just your day. This phone remembers."
            onClose={() => setOpen(false)}
          />
          <SheetBody>
            <ul className="flex flex-col gap-2">
              <LensRow
                label="Everyone"
                active={lens === null}
                avatar={<FamilyAvatar size="lg" />}
                onClick={() => choose(null)}
              />
              {members.map((m) => (
                <LensRow
                  key={m.key}
                  label={m.name}
                  active={lens?.key === m.key}
                  avatar={<Avatar name={m.name} color={m.color} size="lg" />}
                  onClick={() => choose(m.key)}
                />
              ))}
            </ul>
          </SheetBody>
        </Sheet>
      )}
    </>
  );
}

function LensRow({
  label,
  active,
  avatar,
  onClick,
}: {
  label: string;
  active: boolean;
  avatar: ReactNode;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={`flex w-full items-center gap-4 rounded-2xl px-3 py-2.5 text-left text-title text-ink transition-colors ${
          active ? "bg-surface-2 ring-2 ring-inset ring-ink" : "active:bg-surface-2"
        }`}
      >
        {avatar}
        <span className="flex-1">{label}</span>
        {active && <Check className="size-6" strokeWidth={2.5} aria-hidden />}
      </button>
    </li>
  );
}

// ── Navigation ──────────────────────────────────────────────────────────────

function Rail() {
  const isActive = useIsActive();
  return (
    <nav
      aria-label="Primary"
      className="hidden w-[6.5rem] shrink-0 flex-col items-stretch gap-1.5 border-r border-hairline px-2.5 py-4 wide:flex"
    >
      <span className="mb-2 flex h-12 items-center justify-center text-ember" aria-hidden>
        <Flame className="size-8" strokeWidth={2} />
      </span>
      <div className="flex flex-1 flex-col gap-1.5">
        {NAV.map((item) => (
          <RailLink
            key={item.id}
            href={item.href}
            label={item.label}
            Icon={ICONS[item.id]}
            active={isActive(item.href)}
          />
        ))}
      </div>
      <RailLink href="/settings" label="Settings" Icon={Settings} active={isActive("/settings")} />
    </nav>
  );
}

function RailLink({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-stamp font-semibold transition-colors ${
        active ? "bg-surface text-ink shadow-card ring-1 ring-hairline" : "text-ink-soft active:bg-ground-2"
      }`}
    >
      <Icon className="size-7" strokeWidth={active ? 2.1 : 1.8} aria-hidden />
      {label}
    </Link>
  );
}

function TabBar() {
  const isActive = useIsActive();
  return (
    <nav
      aria-label="Primary"
      className="shrink-0 border-t border-hairline bg-surface pb-safe wide:hidden"
    >
      <ul className="flex">
        {NAV.map((item) => {
          const Icon = ICONS[item.id];
          const active = isActive(item.href);
          return (
            <li key={item.id} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] font-semibold ${
                  active ? "text-ink" : "text-ink-faint"
                }`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full ${
                    active ? "bg-ground-2" : ""
                  }`}
                >
                  <Icon className="size-[1.35rem]" strokeWidth={active ? 2.2 : 1.9} aria-hidden />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

function WideHeader() {
  const timeZone = useTimeZone();
  const now = useClock();
  const time = now
    ? now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone })
    : "";
  const date = now
    ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone })
    : "";
  return (
    <header className="hidden h-[5rem] shrink-0 items-center gap-6 border-b border-hairline px-8 wide:flex">
      <div className="flex shrink-0 flex-col justify-center">
        <span className="font-display text-display leading-none tabular-nums text-ink">{time || " "}</span>
        <span className="mt-1 text-label leading-none text-ink-soft">{date || " "}</span>
      </div>
      <div className="flex min-w-0 flex-1 justify-center">
        <HeaderCountdown />
      </div>
      <LensStrip />
    </header>
  );
}

function PhoneBar() {
  const timeZone = useTimeZone();
  const now = useClock();
  const isActive = useIsActive();
  const date = now
    ? now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone })
    : "";
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 wide:hidden">
      <span className="flex items-center gap-2 font-display text-title text-ink">
        <Flame className="size-5 text-ember" strokeWidth={2.2} aria-hidden />
        {date || "Hearth"}
      </span>
      <span className="flex items-center gap-1.5">
        <LensButton />
        <Link
          href="/settings"
          aria-label="Settings"
          aria-current={isActive("/settings") ? "page" : undefined}
          className={`flex size-11 items-center justify-center rounded-full ${
            isActive("/settings") ? "bg-ground-2 text-ink" : "text-ink-soft"
          }`}
        >
          <Settings className="size-6" strokeWidth={1.9} aria-hidden />
        </Link>
      </span>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-ground text-ink">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <WideHeader />
        <PhoneBar />
        <main className="min-h-0 flex-1 overflow-y-auto wide:overflow-hidden">{children}</main>
        <TabBar />
      </div>
    </div>
  );
}
