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
import { Avatar, FamilyAvatar } from "@/components/ui/Avatar";
import { Sheet, SheetBody, SheetHeader } from "@/components/ui/Sheet";
import { Backdrop, useScene } from "./Backdrop";
import { useHousehold } from "./Household";

// The frame around every screen: the scene, the page, and one bar at the
// bottom. There is no header and no side rail, so the page gets the whole
// screen the way a photo frame does.
//
//   wide   the bottom bar holds the people (who's looking), the five
//          destinations as a dock, and the countdown and Settings.
//   phone  a slim top line (date, who's looking, Settings), the page scrolling
//          beneath, and the same five destinations as a floating tab bar.

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

// ── People (the lens) ───────────────────────────────────────────────────────

/** One person in the wide bar: an avatar, growing a name when selected. */
function PersonChip({
  active,
  label,
  avatar,
  onClick,
}: {
  active: boolean;
  label: string;
  avatar: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`flex h-12 shrink-0 items-center gap-2.5 rounded-full p-1 transition-[background-color,opacity,transform] active:scale-95 ${
        active ? "bg-accent pr-4 text-on-accent" : "opacity-75"
      }`}
    >
      {avatar}
      {active && <span className="text-small font-semibold leading-none">{label}</span>}
    </button>
  );
}

/** The people in the wide bar. Tapping the selected person clears the choice. */
function PeopleStrip() {
  const { members, lens, setLens } = useHousehold();
  if (members.length === 0) return null;
  return (
    <div className="dock flex items-center gap-1 rounded-full p-1.5" role="group" aria-label="Who's looking">
      <PersonChip
        active={lens === null}
        label="Everyone"
        avatar={<FamilyAvatar size="md" />}
        onClick={() => setLens(null)}
      />
      {members.map((m) => (
        <PersonChip
          key={m.key}
          active={lens?.key === m.key}
          label={m.name}
          avatar={<Avatar name={m.name} color={m.color} size="md" />}
          onClick={() => setLens(lens?.key === m.key ? null : m.key)}
        />
      ))}
    </div>
  );
}

/** The people on a phone: one button showing who's selected, opening a picker. */
function PeopleButton() {
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
        className="dock flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-small font-semibold text-fg active:scale-95"
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
              <PersonRow
                label="Everyone"
                active={lens === null}
                avatar={<FamilyAvatar size="lg" />}
                onClick={() => choose(null)}
              />
              {members.map((m) => (
                <PersonRow
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

function PersonRow({
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
        className={`flex w-full items-center gap-4 rounded-2xl px-3 py-2.5 text-left font-display text-lead text-fg transition-colors ${
          active ? "bg-fill-2" : "bg-fill active:bg-fill-2"
        }`}
      >
        {avatar}
        <span className="flex-1">{label}</span>
        {active && <Check className="size-6 text-accent" strokeWidth={3} aria-hidden />}
      </button>
    </li>
  );
}

// ── Navigation ──────────────────────────────────────────────────────────────

/** The destinations in the wide bar. */
function Dock() {
  const isActive = useIsActive();
  return (
    <nav aria-label="Primary" className="dock flex items-center gap-1 rounded-full p-1.5">
      {NAV.map((item) => {
        const Icon = ICONS[item.id];
        const active = isActive(item.href);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-12 items-center gap-2 rounded-full px-4 text-small font-semibold leading-none transition-[background-color,color,transform] active:scale-95 ${
              active ? "bg-accent text-on-accent" : "text-fg-soft"
            }`}
          >
            <Icon className="size-6" strokeWidth={active ? 2.4 : 2} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function WideBar() {
  const isActive = useIsActive();
  const settings = isActive("/settings");
  return (
    <footer className="relative hidden h-[5.5rem] shrink-0 items-center justify-between gap-5 px-7 wide:flex">
      <div className="flex shrink-0 items-center">
        <PeopleStrip />
      </div>
      <Dock />
      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        <HeaderCountdown />
        <Link
          href="/settings"
          aria-label="Settings"
          aria-current={settings ? "page" : undefined}
          className={`dock flex size-[3.75rem] shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 ${
            settings ? "text-fg" : "text-fg-soft"
          }`}
        >
          <Settings className="size-6" strokeWidth={settings ? 2.4 : 2} aria-hidden />
        </Link>
      </div>
    </footer>
  );
}

function TabBar() {
  const isActive = useIsActive();
  return (
    <nav aria-label="Primary" className="relative shrink-0 px-3 pb-2 pt-1 wide:hidden">
      <ul className="dock flex rounded-[1.75rem] p-1.5 pb-safe">
        {NAV.map((item) => {
          const Icon = ICONS[item.id];
          const active = isActive(item.href);
          return (
            <li key={item.id} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-[1.25rem] text-[0.6875rem] font-semibold transition-colors ${
                  active ? "bg-accent text-on-accent" : "text-fg-soft"
                }`}
              >
                <Icon className="size-[1.35rem]" strokeWidth={active ? 2.4 : 2} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
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
    <header className="relative flex h-14 shrink-0 items-center justify-between gap-3 px-4 wide:hidden">
      <span className="flex items-center gap-2 font-display text-lead font-medium text-fg">
        <Flame className="size-5 text-spark" strokeWidth={2.4} aria-hidden />
        {date || "Hearth"}
      </span>
      <span className="flex items-center gap-1.5">
        <PeopleButton />
        <Link
          href="/settings"
          aria-label="Settings"
          aria-current={isActive("/settings") ? "page" : undefined}
          className={`dock flex size-11 items-center justify-center rounded-full ${
            isActive("/settings") ? "text-fg" : "text-fg-soft"
          }`}
        >
          <Settings className="size-5" strokeWidth={2} aria-hidden />
        </Link>
      </span>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const scene = useScene();
  return (
    <div className={`scene ${scene} relative flex h-dvh w-full flex-col overflow-hidden text-fg`}>
      <Backdrop />
      <PhoneBar />
      <main className="relative min-h-0 flex-1 overflow-y-auto wide:overflow-hidden">{children}</main>
      <WideBar />
      <TabBar />
    </div>
  );
}
