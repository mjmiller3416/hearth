"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Calendar,
  ListTodo,
  Settings,
  SprayCan,
  SquareCheckBig,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { NAV, type NavId } from "@/lib/config";

// Icons live here (not in config.ts) so config stays pure data importable from
// server code. Icon over label, vertical rail on the left (Phase 0 #4). Phase 2
// splits Tasks into Clean (the cleaning session) and Chores (the kids' list).
const ICONS: Record<NavId, LucideIcon> = {
  calendar: Calendar,
  clean: SprayCan,
  chores: SquareCheckBig,
  lists: ListTodo,
  meals: UtensilsCrossed,
  recipes: BookOpen,
};

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
      className={[
        "flex w-full flex-col items-center gap-2 rounded-2xl px-2 py-4 transition-colors",
        active
          ? "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-hairline)]"
          : "text-ink-soft hover:bg-surface/60",
      ].join(" ")}
    >
      <Icon className="size-9" strokeWidth={1.75} aria-hidden />
      <span className="text-label">{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-36 shrink-0 flex-col gap-2 border-r border-hairline bg-ground px-3 py-5"
    >
      <div className="flex flex-1 flex-col gap-2">
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

      {/* Settings affordance, anchored to the bottom of the rail. */}
      <RailLink
        href="/settings"
        label="Settings"
        Icon={Settings}
        active={isActive("/settings")}
      />
    </nav>
  );
}
