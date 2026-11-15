import { mcpContext, MCP_SCOPE, resourceUrl } from "./config";
import { readAccessToken } from "./tokens";
import { TOOLS, type ToolDef } from "./tools";
import type { ActionResult } from "@/lib/action";

// Hearth's MCP endpoint: JSON-RPC 2.0 over Streamable HTTP, stateless, JSON
// responses only (no SSE, no sessions). Hand-rolled rather than the SDK: the
// surface is five methods and this keeps Hearth dependency-free.
//
//   initialize, notifications/*, ping, tools/list, tools/call
//
// Every request needs an OAuth access token (`requireMcpAccess`, the first
// statement of each handler in src/app/api/mcp/route.ts).

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "hearth", title: "Hearth", version: "1.0.0" };
const INSTRUCTIONS =
  "Hearth is the family's wall display. Use it for the family Google Calendar (list, add, " +
  "change and delete events per person), Tada! cleaning and the kids' chores (see the next " +
  "cleaning task, check tasks off, undo), Enchanted Spoon meals and the shopping list (read " +
  "the plan and recipes, mark a meal cooked, add items) and the kids' school week from Tandem. " +
  "Call get_household first for today's date, the time zone, and the member keys and ids the " +
  "other tools take. Dates are YYYY-MM-DD and times HH:MM in the household's time zone. " +
  "Maryann's own phone alarms on events are get_event_reminders, update_event_reminders and " +
  "check_appointment_reminders (read and written as her Google account).";

/** The 401 that starts ChatGPT's OAuth discovery (RFC 9728 §5.1). */
function unauthorized(origin: string, presented: boolean): Response {
  const parts = [
    `resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    `scope="${MCP_SCOPE}"`,
  ];
  if (presented) parts.push(`error="invalid_token"`, `error_description="The access token is invalid or expired."`);
  return Response.json(
    { error: presented ? "invalid_token" : "unauthorized" },
    { status: 401, headers: { "www-authenticate": `Bearer ${parts.join(", ")}` } },
  );
}

/**
 * The MCP endpoint's gate, the first statement of every handler there: null
 * when the request carries a valid access token for this resource, otherwise
 * the response to return (404 kill switch, 503 not set up, 401 + discovery).
 */
export async function requireMcpAccess(req: Request): Promise<Response | null> {
  const ctx = mcpContext(req);
  if (ctx instanceof Response) return ctx;
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return unauthorized(ctx.origin, false);
  const info = readAccessToken(ctx.secret, match[1].trim(), resourceUrl(ctx.origin));
  if (!info) return unauthorized(ctx.origin, true);
  return null;
}

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: unknown;
  params?: Record<string, unknown>;
}

const rpcError = (id: RpcRequest["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});
const rpcResult = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });

/** A tool's public definition for tools/list (without its handler or route map). */
function describe(tool: ToolDef) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { title: tool.title, ...tool.annotations },
  };
}

/** A friendly sentence for a failed action, from its `{ error }` body. */
function errorSentence(result: ActionResult): string {
  const body = result.body as { error?: unknown } | null;
  const raw = typeof body?.error === "string" ? body.error : "";
  if (raw === "upstream unavailable" || (!raw && result.status >= 500)) {
    return "The service behind this didn't answer. Try again in a minute.";
  }
  if (result.status === 401) return "Hearth couldn't authorize that request.";
  if (!raw) return `That didn't work (status ${result.status}).`;
  return /[.!?]$/.test(raw) ? raw : `${raw[0].toUpperCase()}${raw.slice(1)}.`;
}

/** Run one tool and shape the MCP result: structured content plus the same JSON as text. */
async function callTool(name: unknown, args: unknown) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return null;
  const input = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  let result: ActionResult;
  try {
    result = await tool.run(input);
  } catch (err) {
    console.error(`[mcp] tool ${tool.name} failed:`, err);
    return { content: [{ type: "text", text: "Something went wrong on Hearth. Try again." }], isError: true };
  }
  if (result.status >= 400) {
    return { content: [{ type: "text", text: errorSentence(result) }], isError: true };
  }
  const body =
    result.body && typeof result.body === "object" && !Array.isArray(result.body)
      ? (result.body as Record<string, unknown>)
      : { ok: true, result: result.body ?? null };
  return { content: [{ type: "text", text: JSON.stringify(body) }], structuredContent: body };
}

/** Answer one JSON-RPC message, or null for a notification. */
async function dispatch(msg: RpcRequest): Promise<object | null> {
  if (!msg || typeof msg !== "object") return rpcError(null, -32600, "Invalid request");
  const isNotification = msg.id === undefined;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isNotification ? null : rpcError(msg.id, -32600, "Invalid request");
  }
  if (isNotification) return null; // notifications/initialized and friends

  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      const protocolVersion =
        typeof asked === "string" && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[1];
      return rpcResult(msg.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, { tools: TOOLS.map(describe) });
    case "tools/call": {
      const result = await callTool(msg.params?.name, msg.params?.arguments);
      if (!result) return rpcError(msg.id, -32602, `Unknown tool: ${String(msg.params?.name)}`);
      return rpcResult(msg.id, result);
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/** Handle an authenticated POST to the MCP endpoint (single message or batch). */
export async function handleMcp(req: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }
  const batch = Array.isArray(payload);
  const messages = (batch ? payload : [payload]) as RpcRequest[];
  if (messages.length === 0) {
    return Response.json(rpcError(null, -32600, "Invalid request"), { status: 400 });
  }
  const replies = (await Promise.all(messages.map(dispatch))).filter((r) => r !== null);
  if (replies.length === 0) return new Response(null, { status: 202 });
  return Response.json(batch ? replies : replies[0], {
    headers: { "cache-control": "no-store" },
  });
}
