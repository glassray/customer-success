/**
 * Relay a human's reply back into the customer's live web session.
 *
 * The customer's session is parked (waiting) after escalation. We resume it by
 * POSTing a follow-up to the eve channel with the captured continuation token,
 * framed with a sentinel so the agent knows to relay it warmly to the customer.
 */
import { appUrl } from "./app-url";
import { getContinuation } from "./store";

export const RELAY_SENTINEL = "⟦SPECIALIST_REPLY⟧";

export interface RelayResult {
  ok: boolean;
  error?: string;
}

export async function relayToCustomer(
  webSessionId: string,
  ticketId: string,
  humanMessage: string,
): Promise<RelayResult> {
  const token = await getContinuation(webSessionId);
  if (!token) {
    return { ok: false, error: "No active session token — the customer may have disconnected." };
  }

  const message =
    `${RELAY_SENTINEL} A human specialist replied to ticket ${ticketId}: "${humanMessage}". ` +
    "Relay this to the customer in your own warm voice, then ask whether it resolves their issue.";

  try {
    const res = await fetch(`${appUrl()}/eve/v1/session/${encodeURIComponent(webSessionId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ continuationToken: token, message }),
    });
    if (!res.ok) {
      return { ok: false, error: `eve session responded ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
