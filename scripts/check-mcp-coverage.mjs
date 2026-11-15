// Build-time guard-rail: every wall action has an MCP tool.
//
// The ChatGPT connector promises "everything a person can do on the wall". So
// every HTTP method of every route under src/app/api must be either named in a
// tool's `routes` in src/lib/mcp/tools.ts, or listed in its UNCOVERED_ROUTES
// with the reason. The connector's own routes (/api/mcp, /api/oauth/*) are not
// wall actions and are skipped. Stale entries (a route that no longer exists)
// fail too.
//
// Runs as `npm run check:mcp` (and so before every build).

import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const API_DIR = join("src", "app", "api");
const TOOLS_FILE = join("src", "lib", "mcp", "tools.ts");
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const SKIP = [/^\/api\/mcp$/, /^\/api\/oauth(\/|$)/];

function findRoutes(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findRoutes(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

const hasExport = (node) =>
  node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

// ── The wall's routes ──
const routes = new Set();
for (const file of findRoutes(API_DIR)) {
  const dir = relative(join("src", "app"), file).split(sep).slice(0, -1).join("/");
  const path = `/${dir.split("/").filter((s) => !/^\(.*\)$/.test(s)).join("/")}`;
  if (SKIP.some((re) => re.test(path))) continue;
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && hasExport(stmt) && stmt.name && METHODS.has(stmt.name.text)) {
      routes.add(`${stmt.name.text} ${path}`);
    }
    if (ts.isVariableStatement(stmt) && hasExport(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && METHODS.has(d.name.text)) routes.add(`${d.name.text} ${path}`);
      }
    }
  }
}

// ── What tools.ts claims ──
const toolsSf = ts.createSourceFile(TOOLS_FILE, readFileSync(TOOLS_FILE, "utf8"), ts.ScriptTarget.Latest, true);
const covered = new Map(); // route → tool name
const uncovered = new Set();
function visit(node) {
  // { name: "x", ..., routes: ["GET /api/..."] }
  if (ts.isObjectLiteralExpression(node)) {
    const prop = (key) =>
      node.properties.find((p) => ts.isPropertyAssignment(p) && p.name && p.name.getText(toolsSf) === key);
    const routesProp = prop("routes");
    const nameProp = prop("name");
    if (routesProp && ts.isArrayLiteralExpression(routesProp.initializer)) {
      const toolName =
        nameProp && ts.isStringLiteral(nameProp.initializer) ? nameProp.initializer.text : "?";
      for (const el of routesProp.initializer.elements) {
        if (ts.isStringLiteral(el)) covered.set(el.text, toolName);
      }
    }
  }
  // export const UNCOVERED_ROUTES = { "GET /api/x": "why" }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === "UNCOVERED_ROUTES" &&
    node.initializer &&
    ts.isObjectLiteralExpression(node.initializer)
  ) {
    for (const p of node.initializer.properties) {
      if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.name)) uncovered.add(p.name.text);
    }
  }
  ts.forEachChild(node, visit);
}
visit(toolsSf);

const failures = [];
for (const r of routes) {
  if (!covered.has(r) && !uncovered.has(r)) failures.push(`${r}: no MCP tool covers it`);
}
for (const [r, tool] of covered) {
  if (!routes.has(r)) failures.push(`${r}: named by tool ${tool} but no such route exists`);
}
for (const r of uncovered) {
  if (!routes.has(r)) failures.push(`${r}: in UNCOVERED_ROUTES but no such route exists`);
}

if (failures.length) {
  console.error(`\n✗ check:mcp — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    `\nGive every wall route a tool in ${TOOLS_FILE} (its \`routes\`), or list it in\n` +
      `UNCOVERED_ROUTES with the reason.\n`,
  );
  process.exit(1);
}
console.log(
  `✓ check:mcp — ${routes.size} wall route method(s): ${covered.size} covered by tools, ` +
    `${uncovered.size} left out on purpose.`,
);
