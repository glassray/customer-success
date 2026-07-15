import { defineTool } from "eve/tools";
import { z } from "zod";
import { answerTicket } from "../../lib/handoff";

/**
 * Relay a human specialist's reply back to the customer (support / Slack side).
 *
 * Resumes the customer's parked web session so the answer lands in their chat.
 * The local Support Inbox calls lib/relay directly; this tool is how the
 * Slack-side agent does the same when a specialist answers in a thread.
 */
export default defineTool({
  description:
    "Relay a specialist's reply back to the customer who opened an escalated ticket. Use this " +
    "from the support side (Slack) once a human has written an answer.",
  inputSchema: z.object({
    ticketId: z.string(),
    message: z.string().describe("The specialist's reply, in plain language for the customer."),
  }),
  async execute({ ticketId, message }) {
    const relay = await answerTicket(ticketId, message);
    return relay.ok
      ? { ok: true, ticketId, status: "answered" }
      : { ok: false, error: relay.error };
  },
});
