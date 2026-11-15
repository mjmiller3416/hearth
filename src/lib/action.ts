import { NextResponse } from "next/server";

// The result of one wall action, independent of how it was asked for. Each
// route handler and each MCP tool (src/lib/mcp/tools.ts) runs the SAME action
// function, so validation, allowlists, mock behavior and upstream calls can't
// drift between the wall and ChatGPT. The route turns the result into an HTTP
// response with `toResponse`; the MCP server turns it into a tool result.
//
// Actions never authenticate: the caller has already done that (the route with
// `requireDevice()`, the MCP endpoint with its OAuth access token).

export interface ActionResult {
  /** The HTTP status the wall's route answers with (204 = success, no body). */
  status: number;
  /** The JSON body, or null for a 204. Errors are `{ error: string }`. */
  body: unknown;
}

/** A JSON result. */
export function ok(body: unknown, status = 200): ActionResult {
  return { status, body };
}

/** A success with no body (the route answers 204). */
export function noContent(): ActionResult {
  return { status: 204, body: null };
}

/** An error result carrying a sentence the wall (or ChatGPT) can show. */
export function fail(message: string, status = 400): ActionResult {
  return { status, body: { error: message } };
}

/** The route handler's response for an action result. */
export function toResponse(result: ActionResult): Response {
  if (result.status === 204) return new Response(null, { status: 204 });
  return NextResponse.json(result.body, { status: result.status });
}

/** Sentinel for a request body that isn't JSON. */
export const NOT_JSON = Symbol("not-json");

/** Parse a JSON request body, or return NOT_JSON. */
export async function readJson(req: Request): Promise<unknown | typeof NOT_JSON> {
  try {
    return await req.json();
  } catch {
    return NOT_JSON;
  }
}
