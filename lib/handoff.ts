/**
 * Shared "a human answered this ticket" logic, used by both the Slack-side
 * `relay_to_customer` tool and the local Support Inbox API route.
 */
import { relayToCustomer, type RelayResult } from "./relay";
import { addEvent, getTicket, updateTicket } from "./store";

export async function answerTicket(ticketId: string, message: string): Promise<RelayResult> {
  const ticket = await getTicket(ticketId);
  if (!ticket) return { ok: false, error: `Unknown ticket ${ticketId}` };
  if (!ticket.webSessionId) {
    return { ok: false, error: "Ticket has no linked customer session." };
  }

  await addEvent(ticketId, { at: new Date().toISOString(), actor: "human", text: message });
  const relay = await relayToCustomer(ticket.webSessionId, ticketId, message);
  await updateTicket(ticketId, {
    status: relay.ok ? "answered" : "escalated",
    resolution: message,
  });
  return relay;
}
