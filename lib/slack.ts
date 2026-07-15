/**
 * Slack notify helper for escalations (production human surface).
 *
 * Guarded on SLACK_SUPPORT_CHANNEL_ID so local runs need no Slack at all — the
 * Support Inbox stands in for the human. Credentials come from Vercel Connect,
 * so there is no bot token or signing secret in code.
 */
import { callSlackApi } from "eve/channels/slack";
import { connectSlackCredentials } from "@vercel/connect/eve";
import type { Ticket } from "./store";

const CONNECTOR = process.env.SLACK_CONNECTOR ?? "slack/customer-success";
const CHANNEL = process.env.SLACK_SUPPORT_CHANNEL_ID;

export function slackConfigured(): boolean {
  return Boolean(CHANNEL);
}

export async function postEscalationToSlack(
  ticket: Ticket,
): Promise<{ ok: boolean; threadTs?: string; error?: string }> {
  if (!CHANNEL) return { ok: false, error: "SLACK_SUPPORT_CHANNEL_ID not set" };

  const c = ticket.classification;
  const text =
    `:rotating_light: *Escalation ${ticket.id}* — ${c?.severity ?? "?"} · ${c?.area ?? "?"}\n` +
    `> ${ticket.summary}\n` +
    `${ticket.body}\n` +
    `_Reason: ${ticket.escalationReason ?? "n/a"}_\n` +
    "Reply in this thread and @mention me — I'll relay your answer to the customer.";

  try {
    const { botToken } = connectSlackCredentials(CONNECTOR);
    const res = await callSlackApi({
      botToken,
      operation: "chat.postMessage",
      body: { channel: CHANNEL, text },
    });
    if (!res.ok) return { ok: false, error: String(res.error) };
    return { ok: true, threadTs: (res as { ts?: string }).ts };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
