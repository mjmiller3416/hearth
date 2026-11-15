import { cookies } from "next/headers";
import { isAuthorizedDevice } from "@/lib/auth";
import { getConnectPassword, mcpContext, resourceUrl, type McpContext } from "@/lib/mcp/config";
import { consentPage, errorPage } from "@/lib/mcp/consent";
import { clientIp, resourceMatches } from "@/lib/mcp/oauth";
import {
  checkFormToken,
  FORM_TTL_S,
  issueCode,
  issueFormToken,
  randomId,
  readClient,
  recordFailure,
  safeEqual,
  tooManyFailures,
  type ClientInfo,
} from "@/lib/mcp/tokens";

// GET  /api/oauth/authorize — show the consent page.
// POST /api/oauth/authorize — Allow / Cancel from that page.
//
// Hearth has no accounts, so consent is guarded by a connect password
// (HEARTH_MCP_PASSWORD, constant-time compare, rate limited per IP and overall).
// A browser that already holds the wall's device cookie skips the password. On
// Allow, a signed single-use code (10 min, bound to client, redirect URI, PKCE
// challenge and resource) goes back to the client's registered redirect URI with
// `state` and `iss` (RFC 9207). An unknown client or unregistered redirect URI
// gets an error page and is never redirected.
//
// CSRF: the form carries a signed token bound to the exact authorize parameters
// and to a random nonce cookie set when the page was shown.
//
// PUBLIC on purpose: this IS the sign-in. One of the connector's narrow
// exceptions to "every handler calls requireDevice() first" (README → Security).
export const dynamic = "force-dynamic";

const FIELDS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;
type AuthParams = Record<(typeof FIELDS)[number], string>;

const NONCE_COOKIE = "hearth_oauth_nonce";

function readAuthParams(get: (k: string) => string | null | undefined): AuthParams {
  const out = {} as AuthParams;
  for (const f of FIELDS) out[f] = get(f) ?? "";
  return out;
}

/** The canonical string a form token is bound to. */
function paramsKey(p: AuthParams): string {
  return FIELDS.map((f) => `${f}=${p[f]}`).join("\n");
}

/** Send the browser back to the client with these parameters (+ state and iss). */
function redirectBack(ctx: McpContext, p: AuthParams, extra: Record<string, string>): Response {
  const url = new URL(p.redirect_uri);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  if (p.state) url.searchParams.set("state", p.state);
  url.searchParams.set("iss", ctx.origin);
  return new Response(null, {
    status: 302,
    headers: { location: url.toString(), "cache-control": "no-store" },
  });
}

type Checked =
  | { ok: true; client: ClientInfo }
  | { ok: false; response: Response };

/** Validate an authorize request: dead-end errors first, then redirectable ones. */
function check(ctx: McpContext, p: AuthParams): Checked {
  const client = readClient(ctx.secret, p.client_id);
  if (!client) {
    return { ok: false, response: errorPage("This connection request isn't valid.") };
  }
  if (!client.ru.includes(p.redirect_uri)) {
    return { ok: false, response: errorPage("This connection request has the wrong return address.") };
  }
  const deny = (error: string, description: string) => ({
    ok: false as const,
    response: redirectBack(ctx, p, { error, error_description: description }),
  });
  if (p.response_type !== "code") {
    return deny("unsupported_response_type", "Only response_type=code is supported.");
  }
  if (p.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge)) {
    return deny("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  if (!resourceMatches(p.resource, ctx.origin)) {
    return deny("invalid_target", "That resource isn't served here.");
  }
  return { ok: true, client };
}

/** Passwords compare case-insensitively with spaces read as hyphens (phone keyboards). */
function normalizePassword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

/** The consent page with a fresh form token for this nonce. */
function render(
  ctx: McpContext,
  p: AuthParams,
  client: ClientInfo,
  nonce: string,
  deviceAuthorized: boolean,
  error?: string,
): Response {
  const hidden: Record<string, string> = { ...p, form_token: issueFormToken(ctx.secret, paramsKey(p), nonce) };
  return consentPage(
    { hidden, deviceAuthorized, error, clientName: client.n },
    error ? 400 : 200,
  );
}

export async function GET(req: Request) {
  const ctx = mcpContext(req);
  if (ctx instanceof Response) return ctx;

  const search = new URL(req.url).searchParams;
  const p = readAuthParams((k) => search.get(k));
  const checked = check(ctx, p);
  if (!checked.ok) return checked.response;

  const deviceAuthorized = await isAuthorizedDevice();
  if (!deviceAuthorized && !getConnectPassword()) {
    return errorPage("This Hearth can only be connected from a browser that already shows the wall.", 403);
  }

  const nonce = randomId(24);
  const res = render(ctx, p, checked.client, nonce, deviceAuthorized);
  res.headers.append(
    "set-cookie",
    `${NONCE_COOKIE}=${nonce}; Path=/api/oauth/authorize; Max-Age=${FORM_TTL_S}; HttpOnly; SameSite=Lax` +
      (process.env.NODE_ENV === "production" ? "; Secure" : ""),
  );
  return res;
}

export async function POST(req: Request) {
  const ctx = mcpContext(req);
  if (ctx instanceof Response) return ctx;

  const form = new URLSearchParams(await req.text().catch(() => ""));
  const p = readAuthParams((k) => form.get(k));
  const checked = check(ctx, p);
  if (!checked.ok) return checked.response;

  const nonce = (await cookies()).get(NONCE_COOKIE)?.value;
  if (!checkFormToken(ctx.secret, form.get("form_token"), paramsKey(p), nonce)) {
    return errorPage("This page expired.");
  }

  if (form.get("decision") !== "allow") {
    return redirectBack(ctx, p, { error: "access_denied", error_description: "You cancelled." });
  }

  const deviceAuthorized = await isAuthorizedDevice();
  if (!deviceAuthorized) {
    const expected = getConnectPassword();
    if (!expected) {
      return errorPage("This Hearth can only be connected from a browser that already shows the wall.", 403);
    }
    const ip = clientIp(req);
    if (tooManyFailures(ip)) {
      return render(ctx, p, checked.client, nonce as string, false,
        "Too many wrong tries. Wait 15 minutes and try again.");
    }
    const given = normalizePassword(form.get("password") ?? "");
    if (!given || !safeEqual(given, normalizePassword(expected))) {
      recordFailure(ip);
      return render(ctx, p, checked.client, nonce as string, false, "That password isn't right.");
    }
  }

  const code = issueCode(ctx.secret, {
    clientId: p.client_id,
    redirectUri: p.redirect_uri,
    challenge: p.code_challenge,
    resource: resourceUrl(ctx.origin),
  });
  return redirectBack(ctx, p, { code });
}
