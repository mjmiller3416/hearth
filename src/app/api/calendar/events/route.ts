import { requireDevice } from "@/lib/auth";
import { fail, NOT_JSON, readJson, toResponse } from "@/lib/action";
import { createEvent, deleteEvent, editEvent } from "@/lib/calendar/actions";

// POST /api/calendar/events   — create an event
// PUT  /api/calendar/events   — edit an event (fields and/or who's assigned)
// DELETE /api/calendar/events — remove an event (every copy of a Hearth event by
//                               group id, or one phone-made event in place)
//
// The rules live in src/lib/calendar/actions.ts, shared with the MCP tools.
//
// SECURITY: this is the device token's WRITE surface. `requireDevice()` is the
// FIRST statement in every handler, before any body parsing (Phase 0.1). Create
// derives targets entirely from member config (client can't name a calendar).
// Edit/delete accept a client-named {calendarId,eventId} only for a NON-Hearth
// event — it is allowlisted against the read set and re-checked server-side.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireDevice();
  if (denied) return denied;
  const body = await readJson(req);
  if (body === NOT_JSON) return toResponse(fail("Request body must be JSON."));
  return toResponse(await createEvent(body));
}

export async function PUT(req: Request) {
  const denied = await requireDevice();
  if (denied) return denied;
  const body = await readJson(req);
  if (body === NOT_JSON) return toResponse(fail("Request body must be JSON."));
  return toResponse(await editEvent(body));
}

export async function DELETE(req: Request) {
  const denied = await requireDevice();
  if (denied) return denied;
  const body = await readJson(req);
  if (body === NOT_JSON) return toResponse(fail("Request body must be JSON."));
  return toResponse(await deleteEvent(body));
}
