import { connectSlackCredentials } from "@vercel/connect/eve";
import { defaultSlackAuth, slackChannel } from "eve/channels/slack";
import { findBySlackThread } from "../../lib/store";

/**
 * Slack is the production human surface for escalations.
 *
 * `escalate_to_human` posts the ticket here; when a specialist @mentions the
 * bot in that thread, we look the thread up, inject the ticket context, and let
 * the agent relay the reply to the customer with `relay_to_customer`.
 *
 * Set up (deploy-only — Slack delivers events to the deployed URL, not localhost):
 *   vercel connect create slack --triggers
 *   vercel connect attach <uid> --triggers --trigger-path /eve/v1/slack --yes
 * Then set SLACK_SUPPORT_CHANNEL_ID (and SLACK_CONNECTOR if not slack/customer-success).
 */
const CONNECTOR = process.env.SLACK_CONNECTOR ?? "slack/customer-success";

export default slackChannel({
  credentials: connectSlackCredentials(CONNECTOR),
  threadContext: { since: "last-agent-reply" },
  async onAppMention(ctx, message) {
    if (!message.author) return null;

    // Best-effort thread anchor -> ticket lookup.
    const m = message as unknown as { threadTs?: string; ts?: string };
    const threadTs = m.threadTs ?? m.ts;
    const ticket = threadTs ? await findBySlackThread(threadTs) : undefined;

    const context = ticket
      ? [
          `You are assisting a Vercel support specialist in Slack on escalated ticket ${ticket.id} ` +
            `("${ticket.summary}"). Take the specialist's reply and call relay_to_customer with ` +
            `ticketId "${ticket.id}" and their message to send it back to the customer's chat.`,
        ]
      : undefined;

    return { auth: defaultSlackAuth(message, ctx), context };
  },
});
