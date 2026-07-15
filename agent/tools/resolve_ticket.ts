import { defineTool } from "eve/tools";
import { z } from "zod";
import { addEvent, updateTicket } from "../../lib/store";

/**
 * Mark a ticket resolved once you have given the customer a working answer.
 */
export default defineTool({
  description:
    "Mark a ticket as resolved after you have answered the customer. Only use this when you " +
    "resolved it yourself without a human — otherwise use escalate_to_human.",
  inputSchema: z.object({
    ticketId: z.string(),
    resolution: z.string().describe("A short note on how it was resolved, for the record."),
  }),
  async execute({ ticketId, resolution }) {
    const ticket = await updateTicket(ticketId, { status: "resolved", resolution });
    if (!ticket) return { ok: false, error: `Unknown ticket ${ticketId}` };
    await addEvent(ticketId, {
      at: new Date().toISOString(),
      actor: "eve",
      text: `Resolved: ${resolution}`,
    });
    return { ok: true, ticketId, status: "resolved" };
  },
});
