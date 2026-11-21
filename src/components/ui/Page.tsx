import type { ReactNode } from "react";

// The frame every page but Home shares: a big title on the scene, that page's
// controls beside it, the content beneath. On a wide screen the page fills the
// frame's height and its panels scroll inside it; on a phone the whole page
// scrolls and the controls wrap under the title.

export function Page({
  title,
  eyebrow,
  controls,
  children,
}: {
  title: ReactNode;
  /** A small line above the title (e.g. "This week"). */
  eyebrow?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col px-4 pb-6 pt-1 wide:h-full wide:px-7 wide:pb-2 wide:pt-6">
      <header className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 wide:mb-5">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-small font-semibold uppercase tracking-[0.12em] text-fg-soft">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-huge font-medium leading-none text-fg">{title}</h1>
        </div>
        {controls && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-4 gap-y-2">
            {controls}
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
