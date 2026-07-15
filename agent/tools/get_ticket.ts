import { defineTool } from "eve/tools";
import { z } from "zod";
import { getTicket } from "../../lib/store";

/**
 * Look up a single ticket by id — status, classification, resolution, history.
 * Internal fields (session id, Slack thread, tokens) are never returned.
 */
export default defineTool({
  description:
    "Fetch the details and status of an existing ticket by its id (e.g. VS-104). Use this when a " +
    "customer asks about a ticket, or to check a related ticket you found with list_tickets.",
  inputSchema: z.object({
    ticketId: z.string().describe("The ticket id, e.g. VS-104."),
  }),
  async execute({ ticketId }) {
    const t = await getTicket(ticketId);
    if (!t) return { ok: false, error: `No ticket ${ticketId} found.` };
    return {
      ok: true,
      ticket: {
        id: t.id,
        status: t.status,
        createdAt: t.createdAt,
        summary: t.summary,
        classification: t.classification,
        resolution: t.resolution ?? null,
        escalationReason: t.escalationReason ?? null,
        // last few history entries, without internal identifiers
        recentEvents: t.events.slice(-5).map((e) => ({ actor: e.actor, text: e.text })),
      },
    };
  },
});
