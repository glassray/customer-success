import { defineTool } from "eve/tools";
import { z } from "zod";
import { listTickets, type Ticket } from "../../lib/store";

/**
 * List/search recent tickets as trimmed summaries. Optional filters by status,
 * product area, or reporter email. Internal fields are never returned.
 */
export default defineTool({
  description:
    "List or search recent support tickets (most recent first) as short summaries. Optionally " +
    "filter by status, product area, or reporter email. Use this to find related or duplicate " +
    "tickets, or to answer questions like 'how many billing issues are open?'.",
  inputSchema: z.object({
    status: z.enum(["open", "resolved", "escalated", "answered"]).optional(),
    area: z.string().optional().describe('Product area, e.g. "Billing", "Domains", "Builds".'),
    reporterEmail: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20)."),
  }),
  async execute({ status, area, reporterEmail, limit }) {
    let tickets = await listTickets();
    if (status) tickets = tickets.filter((t) => t.status === status);
    if (area) tickets = tickets.filter((t) => t.classification?.area?.toLowerCase() === area.toLowerCase());
    if (reporterEmail) tickets = tickets.filter((t) => t.reporterEmail === reporterEmail);

    const trimmed = tickets.slice(0, limit ?? 20).map((t: Ticket) => ({
      id: t.id,
      status: t.status,
      type: t.classification?.type ?? null,
      severity: t.classification?.severity ?? null,
      area: t.classification?.area ?? null,
      summary: t.summary,
      createdAt: t.createdAt,
    }));

    return { ok: true, count: trimmed.length, tickets: trimmed };
  },
});
