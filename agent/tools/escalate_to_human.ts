import { defineTool } from "eve/tools";
import { z } from "zod";
import { addEvent, updateTicket } from "../../lib/store";
import { postEscalationToSlack, slackConfigured } from "../../lib/slack";

/**
 * Escalate a ticket to a human specialist and open the handoff.
 *
 * Links the ticket to the customer's current session so a human's reply can be
 * relayed straight back into this chat. In production it posts to Slack; with
 * no Slack configured, it routes to the local Support Inbox.
 */
export default defineTool({
  description:
    "Escalate a ticket to a human specialist. Use for genuine product bugs, outages, " +
    "billing/account changes, data loss, security issues, or anything you cannot confidently " +
    "resolve from documentation. AFTER calling this you MUST immediately call ask_question " +
    "(allowFreeform: true) to keep the customer's chat open while the specialist replies.",
  inputSchema: z.object({
    ticketId: z.string(),
    reason: z.string().describe("Why this needs a human."),
  }),
  async execute({ ticketId, reason }, ctx) {
    const ticket = await updateTicket(ticketId, {
      status: "escalated",
      escalationReason: reason,
      webSessionId: ctx.session.id,
    });
    if (!ticket) return { ok: false, error: `Unknown ticket ${ticketId}` };

    await addEvent(ticketId, {
      at: new Date().toISOString(),
      actor: "eve",
      text: `Escalated to a human: ${reason}`,
    });

    let routing = "Routed to the Support Inbox (no Slack configured).";
    if (slackConfigured()) {
      const posted = await postEscalationToSlack({ ...ticket, escalationReason: reason });
      if (posted.ok && posted.threadTs) {
        await updateTicket(ticketId, { slackThreadTs: posted.threadTs });
        routing = `Posted to Slack (thread ${posted.threadTs}).`;
      } else {
        routing = `Slack post failed (${posted.error}); visible in the Support Inbox.`;
      }
    }

    return {
      ok: true,
      ticketId,
      status: "escalated",
      routing,
      nextStep:
        "Now call ask_question (allowFreeform: true): tell the customer a specialist is looking " +
        "into it and that their reply will appear right here.",
    };
  },
});
