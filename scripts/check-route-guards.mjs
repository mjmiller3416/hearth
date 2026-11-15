// Build-time guard-rail: every route handler authenticates as its FIRST thing.
//
// Hearth has no middleware on purpose (README → Security), so each handler must
// verify for itself. This check walks every `route.ts` under src/app and fails
// the build unless each exported HTTP handler opens with
//
//   const denied = await <guard>(...);
//   if (denied) return denied;
//
// where <guard> is `requireDevice` (the wall's device cookie) — except for the
// short, explicit lists below:
//   - OAUTH_GUARDED: the MCP endpoint, which authenticates ChatGPT with an OAuth
//     access token (`requireMcpAccess`) instead of the device cookie;
//   - PUBLIC: routes that are the authentication itself or carry no household
//     data (pairing, health, OAuth discovery/registration/consent/token/revoke).
// Anything not listed must use requireDevice. A listed file that no longer
// exists also fails, so the lists can't silently grow stale.
//
// Runs as part of `npm run check:auth` (and so before every build).

import ts from "typescript";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const APP_DIR = join("src", "app");
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

const DEFAULT_GUARD = { name: "requireDevice", module: "@/lib/auth" };

const OAUTH_GUARDED = {
  "src/app/api/mcp/route.ts": { name: "requireMcpAccess", module: "@/lib/mcp/server" },
};

const PUBLIC = {
  "src/app/(public)/setup/route.ts": "device pairing: the token in the URL is the credential",
  "src/app/health/route.ts": "Railway health check, a literal 200",
  "src/app/.well-known/oauth-protected-resource/route.ts": "OAuth discovery (RFC 9728)",
  "src/app/.well-known/oauth-protected-resource/api/mcp/route.ts": "OAuth discovery (RFC 9728)",
  "src/app/.well-known/oauth-authorization-server/route.ts": "OAuth discovery (RFC 8414)",
  "src/app/api/oauth/register/route.ts": "OAuth client registration grants nothing by itself",
  "src/app/api/oauth/authorize/route.ts": "OAuth consent: asks for the connect password or device cookie",
  "src/app/api/oauth/token/route.ts": "OAuth token endpoint: the code/refresh token is the credential",
  "src/app/api/oauth/revoke/route.ts": "OAuth revocation: can only take access away",
};

function findRoutes(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findRoutes(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

const posix = (p) => relative(".", p).split(sep).join("/");
const hasExport = (node) =>
  node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

/** Every exported HTTP handler in the file: [name, body block | null]. */
function handlers(sf) {
  const out = [];
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && hasExport(stmt) && stmt.name && METHODS.has(stmt.name.text)) {
      out.push([stmt.name.text, stmt.body ?? null]);
    }
    if (ts.isVariableStatement(stmt) && hasExport(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !METHODS.has(d.name.text)) continue;
        const init = d.initializer;
        const body =
          init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && ts.isBlock(init.body)
            ? init.body
            : null;
        out.push([d.name.text, body]);
      }
    }
  }
  return out;
}

function importsGuard(sf, guard) {
  return sf.statements.some(
    (s) =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === guard.module &&
      s.importClause?.namedBindings &&
      ts.isNamedImports(s.importClause.namedBindings) &&
      s.importClause.namedBindings.elements.some((e) => e.name.text === guard.name),
  );
}

/** True when the block opens with `const x = await guard(...); if (x) return x;`. */
function opensWithGuard(body, guard) {
  if (!body) return false;
  const [first, second] = body.statements;
  if (!first || !ts.isVariableStatement(first)) return false;
  const decls = first.declarationList.declarations;
  if (decls.length !== 1 || !ts.isIdentifier(decls[0].name)) return false;
  const varName = decls[0].name.text;
  const init = decls[0].initializer;
  if (!init || !ts.isAwaitExpression(init)) return false;
  const call = init.expression;
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return false;
  if (call.expression.text !== guard.name) return false;
  if (!second || !ts.isIfStatement(second)) return false;
  if (!ts.isIdentifier(second.expression) || second.expression.text !== varName) return false;
  const then = ts.isBlock(second.thenStatement)
    ? second.thenStatement.statements[0]
    : second.thenStatement;
  return Boolean(
    then && ts.isReturnStatement(then) && then.expression &&
      ts.isIdentifier(then.expression) && then.expression.text === varName,
  );
}

const failures = [];
for (const listed of [...Object.keys(PUBLIC), ...Object.keys(OAUTH_GUARDED)]) {
  if (!existsSync(listed)) failures.push(`${listed}: listed as an exception but doesn't exist; remove it.`);
}

const routes = findRoutes(APP_DIR);
let guarded = 0;
for (const file of routes) {
  const rel = posix(file);
  if (PUBLIC[rel]) continue;
  const guard = OAUTH_GUARDED[rel] ?? DEFAULT_GUARD;
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = handlers(sf);
  if (found.length === 0) continue;
  if (!importsGuard(sf, guard)) {
    failures.push(`${rel}: missing \`import { ${guard.name} } from "${guard.module}"\``);
    continue;
  }
  for (const [name, body] of found) {
    if (!opensWithGuard(body, guard)) {
      failures.push(
        `${rel} ${name}: must open with \`const denied = await ${guard.name}(...); if (denied) return denied;\``,
      );
    } else guarded++;
  }
}

if (failures.length) {
  console.error(`\n✗ check:auth — ${failures.length} route handler problem(s):\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    `\nEvery handler under ${APP_DIR} must authenticate first (requireDevice, or\n` +
      `requireMcpAccess for the MCP endpoint). Truly public routes are listed in\n` +
      `scripts/check-route-guards.mjs with the reason; keep that list short.\n`,
  );
  process.exit(1);
}

console.log(
  `✓ check:auth — ${guarded} route handler(s) authenticate first; ` +
    `${Object.keys(PUBLIC).length} public route file(s) on the allowlist.`,
);
