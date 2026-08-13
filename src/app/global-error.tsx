"use client";

// Last-resort boundary for when the root layout itself throws. Replaces the
// whole document, so it carries its own inline styles and never shows a stack
// trace on the wall (spec §6.2, Phase 0 #11).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4efe4",
          color: "#6f675a",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <button
          onClick={reset}
          style={{
            background: "none",
            border: "none",
            color: "inherit",
            fontSize: "1.75rem",
            cursor: "pointer",
          }}
        >
          One moment…
        </button>
      </body>
    </html>
  );
}
