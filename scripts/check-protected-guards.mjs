// Build-time guard-rail (Phase 0.1). Fails the build if any protected page is
// missing its authorization gate.
//
// WHY THIS EXISTS: the (protected) layout redirect is NOT sufficient on its
// own — Next renders each page as an independent segment, so an unauthorized
// full-document request will serialize a protected page's RSC flight into the
// redirect document unless the page itself short-circuits first. The fix is
// that every protected page `await`s requireAuthorizedPage() as its FIRST
// statement (see src/lib/auth.ts). That invariant is easy to forget on a new
// page, so this check enforces it mechanically.
//
// Runs via `npm run check:auth`, and automatically before every build through
// the `prebuild` npm lifecycle hook — including the Railway Docker build.

import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PROTECTED_DIR = join("src", "app", "(protected)");
const GUARD = "requireAuthorizedPage";
const AUTH_MODULE = "@/lib/auth";

/** Recursively collect every `page.tsx` under the (protected) route group. */
function findProtectedPages(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findProtectedPages(full));
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

/** True if the file imports `requireAuthorizedPage` from `@/lib/auth`. */
function importsGuard(sourceFile) {
  return sourceFile.statements.some((stmt) => {
    if (!ts.isImportDeclaration(stmt)) return false;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) return false;
    if (stmt.moduleSpecifier.text !== AUTH_MODULE) return false;
    const named = stmt.importClause?.namedBindings;
    return (
      named &&
      ts.isNamedImports(named) &&
      named.elements.some((el) => el.name.text === GUARD)
    );
  });
}

const hasModifier = (node, kind) =>
  node.modifiers?.some((m) => m.kind === kind) ?? false;

/**
 * Resolve the default-exported component function of a page module, covering
 * the two forms that occur in this codebase:
 *   export default async function Page() {}          (function declaration)
 *   const Page = async () => {}; export default Page (arrow via identifier)
 * Returns the function/arrow node, or null if it can't be identified.
 */
function findDefaultExportFn(sourceFile) {
  // Form 1: `export default function ...`
  for (const stmt of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(stmt) &&
      hasModifier(stmt, ts.SyntaxKind.ExportKeyword) &&
      hasModifier(stmt, ts.SyntaxKind.DefaultKeyword)
    ) {
      return stmt;
    }
  }
  // Form 2: `export default <identifier>` → find its declaration.
  const exportAssignment = sourceFile.statements.find(
    (s) => ts.isExportAssignment(s) && !s.isExportEquals,
  );
  if (exportAssignment) {
    const expr = exportAssignment.expression;
    if (ts.isFunctionExpression(expr) || ts.isArrowFunction(expr)) return expr;
    if (ts.isIdentifier(expr)) {
      for (const stmt of sourceFile.statements) {
        if (!ts.isVariableStatement(stmt)) continue;
        for (const decl of stmt.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.name.text === expr.text &&
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) ||
              ts.isFunctionExpression(decl.initializer))
          ) {
            return decl.initializer;
          }
        }
      }
    }
  }
  return null;
}

/** True if the function's FIRST statement is `await requireAuthorizedPage(...)`. */
function guardIsFirstStatement(fn) {
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return false;
  const first = body.statements[0];
  if (!first || !ts.isExpressionStatement(first)) return false;
  const awaited = first.expression;
  if (!ts.isAwaitExpression(awaited)) return false;
  const call = awaited.expression;
  return (
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    call.expression.text === GUARD
  );
}

const pages = findProtectedPages(PROTECTED_DIR);
if (pages.length === 0) {
  console.error(
    `check:auth — found no page.tsx under ${PROTECTED_DIR}. Did the path move?`,
  );
  process.exit(1);
}

const failures = [];
for (const file of pages) {
  const src = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );

  const fn = findDefaultExportFn(src);
  if (!fn) {
    failures.push(`${file}: could not find a default-exported page component.`);
    continue;
  }
  const reasons = [];
  if (!importsGuard(src))
    reasons.push(`missing \`import { ${GUARD} } from "${AUTH_MODULE}"\``);
  if (!hasModifier(fn, ts.SyntaxKind.AsyncKeyword))
    reasons.push("component is not `async` (the gate must be awaited)");
  if (!guardIsFirstStatement(fn))
    reasons.push(`first statement is not \`await ${GUARD}()\``);
  if (reasons.length) failures.push(`${file}:\n    - ${reasons.join("\n    - ")}`);
}

if (failures.length) {
  console.error(
    `\n✗ check:auth — ${failures.length} protected page(s) missing the authorization gate:\n`,
  );
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    `\nEvery page under ${PROTECTED_DIR} must \`await ${GUARD}()\` as its first\n` +
      `statement, or an unauthenticated request can leak its rendered content in\n` +
      `the redirect document's RSC flight. See src/lib/auth.ts.\n`,
  );
  process.exit(1);
}

console.log(
  `✓ check:auth — all ${pages.length} protected page(s) gate with ${GUARD}().`,
);
