import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Stateless OAuth artifacts for the ChatGPT connector. Hearth has no database
// (spec D1), so every client id, authorization code and token is a signed blob:
//
//   <prefix>.<base64url(JSON payload)>.<base64url(HMAC-SHA256)>
//
// keyed by HEARTH_MCP_SECRET, with a separate derived key per kind so one kind
// can never be replayed as another. Nothing is stored except a few small
// in-process sets (used codes, used refresh tokens, revoked connections), which
// only tighten things within one process and are lost on a restart. Known
// limits, accepted and documented in CLAUDE.md:
//   - a rotated refresh token stays valid after a restart until it expires;
//   - revoke and code-reuse revocation last only as long as the process;
//   - revoking everything = rotating HEARTH_MCP_SECRET.

export const CODE_TTL_S = 10 * 60;
export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_S = 90 * 24 * 60 * 60;
export const FORM_TTL_S = 15 * 60;

type Kind = "client" | "client-secret" | "code" | "access" | "refresh" | "form";

const PREFIX: Record<Exclude<Kind, "client-secret">, string> = {
  client: "hcl",
  code: "hco",
  access: "hat",
  refresh: "hrt",
  form: "hfm",
};

export type AuthMethod = "none" | "client_secret_post" | "client_secret_basic";

export interface ClientInfo {
  /** Registered redirect URIs (exact match on authorize and token). */
  ru: string[];
  /** Token endpoint auth method. */
  am: AuthMethod;
  /** Client name, for the consent page. */
  n?: string;
  /** Issued at, epoch seconds. */
  iat: number;
}

export interface CodeInfo {
  jti: string;
  /** Short hash of the client id the code was issued to. */
  cid: string;
  ru: string;
  /** PKCE S256 challenge. */
  cc: string;
  /** The resource (audience) asked for. */
  res: string;
  exp: number;
}

export interface TokenInfo {
  /** Present on refresh tokens: their own id, for in-process rotation. */
  jti?: string;
  cid: string;
  /** The connection ("family"): the id of the code it all started from. */
  fam: string;
  sc: string;
  aud: string;
  exp: number;
}

interface FormInfo {
  /** Hash of the authorize parameters the form was rendered for. */
  p: string;
  /** Hash of the browser's nonce cookie. */
  nc: string;
  exp: number;
}

// ── Primitives ───────────────────────────────────────────────────────────────

export const nowS = () => Math.floor(Date.now() / 1000);

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

/** URL-safe random id. */
export function randomId(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** base64url(SHA-256(input)). */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

function keyFor(secret: string, kind: Kind): Buffer {
  return createHmac("sha256", secret).update(`hearth-mcp/${kind}`).digest();
}

/** Constant-time string comparison (hashes first, so lengths don't leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

function sign(secret: string, kind: Exclude<Kind, "client-secret">, payload: object): string {
  const head = `${PREFIX[kind]}.${b64url(JSON.stringify(payload))}`;
  const mac = createHmac("sha256", keyFor(secret, kind)).update(head).digest("base64url");
  return `${head}.${mac}`;
}

function verify<T extends object>(
  secret: string,
  kind: Exclude<Kind, "client-secret">,
  token: unknown,
): T | null {
  if (typeof token !== "string" || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX[kind]) return null;
  const head = `${parts[0]}.${parts[1]}`;
  const mac = createHmac("sha256", keyFor(secret, kind)).update(head).digest("base64url");
  if (!safeEqual(mac, parts[2])) return null;
  let payload: T & { exp?: number };
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.exp === "number" && payload.exp <= nowS()) return null;
  return payload;
}

// ── In-process memory (see the header for what it does and doesn't promise) ──

interface Memory {
  usedCodes: Map<string, number>;
  usedRefresh: Map<string, number>;
  revoked: Map<string, number>;
  failures: Map<string, number[]>;
}

// On globalThis so every route bundle in the process shares one copy.
const g = globalThis as { __hearthMcpMemory?: Memory };
const memory: Memory = (g.__hearthMcpMemory ??= {
  usedCodes: new Map(),
  usedRefresh: new Map(),
  revoked: new Map(),
  failures: new Map(),
});

/** Drop entries whose expiry (epoch seconds) has passed. */
function prune(map: Map<string, number>) {
  const now = nowS();
  for (const [k, exp] of map) if (exp <= now) map.delete(k);
}

/** Revoke a connection (every token from one authorization) in this process. */
export function revokeFamily(fam: string) {
  prune(memory.revoked);
  memory.revoked.set(fam, nowS() + REFRESH_TTL_S);
}

function isRevoked(fam: string): boolean {
  const exp = memory.revoked.get(fam);
  return exp !== undefined && exp > nowS();
}

// ── Clients (Dynamic Client Registration) ────────────────────────────────────

/** A client id is the signed client record itself. */
export function issueClientId(secret: string, info: ClientInfo): string {
  return sign(secret, "client", info);
}

export function readClient(secret: string, clientId: unknown): ClientInfo | null {
  const info = verify<ClientInfo>(secret, "client", clientId);
  if (!info || !Array.isArray(info.ru) || typeof info.am !== "string") return null;
  return info;
}

/** A confidential client's secret, derived from its id (nothing to store). */
export function clientSecretFor(secret: string, clientId: string): string {
  return createHmac("sha256", keyFor(secret, "client-secret")).update(clientId).digest("base64url");
}

/** Short, stable hash of a client id, bound into codes and tokens. */
export function clientHash(clientId: string): string {
  return sha256(clientId).slice(0, 22);
}

// ── Authorization codes ──────────────────────────────────────────────────────

export function issueCode(
  secret: string,
  args: { clientId: string; redirectUri: string; challenge: string; resource: string },
): string {
  const info: CodeInfo = {
    jti: randomId(16),
    cid: clientHash(args.clientId),
    ru: args.redirectUri,
    cc: args.challenge,
    res: args.resource,
    exp: nowS() + CODE_TTL_S,
  };
  return sign(secret, "code", info);
}

export function readCode(secret: string, code: unknown): CodeInfo | null {
  return verify<CodeInfo>(secret, "code", code);
}

/**
 * Mark a code used. Returns false when it was already used — the caller must
 * then refuse it, and this also revokes every token issued from it (RFC 6749
 * §4.1.2), within this process.
 */
export function consumeCode(info: CodeInfo): boolean {
  prune(memory.usedCodes);
  if (memory.usedCodes.has(info.jti)) {
    revokeFamily(info.jti);
    return false;
  }
  memory.usedCodes.set(info.jti, info.exp);
  return true;
}

// ── Access and refresh tokens ────────────────────────────────────────────────

export interface TokenPair {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export function issueTokens(
  secret: string,
  args: { cid: string; fam: string; scope: string; aud: string },
): TokenPair {
  const now = nowS();
  const base = { cid: args.cid, fam: args.fam, sc: args.scope, aud: args.aud };
  const access: TokenInfo = { ...base, exp: now + ACCESS_TTL_S };
  const refresh: TokenInfo = { ...base, jti: randomId(16), exp: now + REFRESH_TTL_S };
  return {
    access_token: sign(secret, "access", access),
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: sign(secret, "refresh", refresh),
    scope: args.scope,
  };
}

/** A valid, unexpired, unrevoked access token for `aud`, or null. */
export function readAccessToken(secret: string, token: unknown, aud: string): TokenInfo | null {
  const info = verify<TokenInfo>(secret, "access", token);
  if (!info || info.aud !== aud || isRevoked(info.fam)) return null;
  return info;
}

/** A valid, unexpired, unrevoked refresh token, or null (no rotation check). */
export function readRefreshToken(secret: string, token: unknown): TokenInfo | null {
  const info = verify<TokenInfo>(secret, "refresh", token);
  if (!info || typeof info.jti !== "string" || isRevoked(info.fam)) return null;
  return info;
}

/** Mark a refresh token used (rotation). False when it was already used here. */
export function consumeRefresh(info: TokenInfo): boolean {
  prune(memory.usedRefresh);
  if (!info.jti || memory.usedRefresh.has(info.jti)) return false;
  memory.usedRefresh.set(info.jti, info.exp);
  return true;
}

/** Either kind of token, for the revocation endpoint. */
export function readAnyToken(secret: string, token: unknown): TokenInfo | null {
  return (
    verify<TokenInfo>(secret, "access", token) ?? verify<TokenInfo>(secret, "refresh", token)
  );
}

// ── The consent form's CSRF token ────────────────────────────────────────────

/** A form token bound to these authorize parameters and this browser's nonce. */
export function issueFormToken(secret: string, paramsKey: string, nonce: string): string {
  const info: FormInfo = { p: sha256(paramsKey), nc: sha256(nonce), exp: nowS() + FORM_TTL_S };
  return sign(secret, "form", info);
}

export function checkFormToken(
  secret: string,
  token: unknown,
  paramsKey: string,
  nonce: string | undefined,
): boolean {
  const info = verify<FormInfo>(secret, "form", token);
  if (!info || !nonce) return false;
  return safeEqual(info.p, sha256(paramsKey)) && safeEqual(info.nc, sha256(nonce));
}

// ── Password attempts ────────────────────────────────────────────────────────

const WINDOW_S = 15 * 60;
const PER_IP = 5;
const OVERALL = 20;

function recent(key: string): number[] {
  const cutoff = nowS() - WINDOW_S;
  const list = (memory.failures.get(key) ?? []).filter((t) => t > cutoff);
  if (list.length) memory.failures.set(key, list);
  else memory.failures.delete(key);
  return list;
}

/** True when this IP (or everyone together) has failed too often lately. */
export function tooManyFailures(ip: string): boolean {
  return recent(`ip:${ip}`).length >= PER_IP || recent("all").length >= OVERALL;
}

export function recordFailure(ip: string) {
  const now = nowS();
  for (const key of [`ip:${ip}`, "all"]) memory.failures.set(key, [...recent(key), now]);
}
