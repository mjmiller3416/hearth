import type { SourceEnvelope, SourceError, SourceStatus } from "./types";

// Building blocks for the Home Base summary's per-source envelopes, and the
// time bound every upstream read runs under.

/** Thrown by `withTimeout` when a source takes longer than its budget. */
export class SourceTimeout extends Error {}

/**
 * Resolve `work`, or reject with SourceTimeout after `ms`. The upstream call
 * isn't cancelled (Hearth's clients take no AbortSignal), but the summary stops
 * waiting for it, so one slow app can't hold the whole response.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SourceTimeout(`timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const iso = (ms: number | null | undefined) =>
  ms === null || ms === undefined || Number.isNaN(ms) ? null : new Date(ms).toISOString();

/** A source that answered. */
export function okEnvelope<T>(
  data: T,
  fetchedAt: number,
  dataAsOf: number | string | null,
  status: Extract<SourceStatus, "ok" | "partial"> = "ok",
  error: SourceError | null = null,
): SourceEnvelope<T> {
  return {
    status,
    fetched_at: iso(fetchedAt),
    data_as_of: typeof dataAsOf === "string" ? dataAsOf : iso(dataAsOf),
    error,
    data,
  };
}

/** A source with no data this time (error, not configured, wrong date). */
export function emptyEnvelope<T>(
  status: Exclude<SourceStatus, "ok" | "partial">,
  error: SourceError | null,
): SourceEnvelope<T> {
  return { status, fetched_at: null, data_as_of: null, error, data: null };
}

/** The envelope for a thrown error, without leaking upstream detail. */
export function errorEnvelope<T>(source: string, err: unknown): SourceEnvelope<T> {
  if (err instanceof SourceTimeout) {
    return emptyEnvelope("error", {
      code: "timeout",
      message: `${source} didn't answer in time.`,
    });
  }
  // Log the detail server-side; the caller only gets a generic sentence.
  console.error(`[home-base] ${source} failed:`, err);
  return emptyEnvelope("error", {
    code: "upstream_error",
    message: `${source} couldn't be read right now.`,
  });
}

/** The standard "this integration isn't wired on Hearth" envelope. */
export function notConfigured<T>(source: string): SourceEnvelope<T> {
  return emptyEnvelope("not_configured", {
    code: "not_configured",
    message: `${source} isn't connected to Hearth.`,
  });
}
