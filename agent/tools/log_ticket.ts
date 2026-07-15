import { defineTool } from "eve/tools";
import { z } from "zod";
import { appUrl } from "../../lib/app-url";
import type { TicketClassification } from "../../lib/store";

/**
 * Log a support ticket by triggering the durable ticket-logging Workflow.
 *
 * eve runs in its own server without the workflow build transform, so we can't
 * call `start()` here directly. Instead we POST to the Next.js route
 * (`/api/log-ticket`), which starts the workflow (assign id -> AI classify ->
 * persist) and returns the ticket id + classification.
 */
export default defineTool({
  description:
    "Log a new support ticket. Call this once, first, for every customer issue or piece of " +
    "feedback before doing anything else. Returns the ticket id and an AI classification " +
    "(type, severity, product area, and whether it can be auto-resolved).",
  inputSchema: z.object({
    summary: z.string().describe("A short one-line summary of the issue."),
    body: z.string().describe("The customer's full description, verbatim."),
    reporterEmail: z.string().optional().describe("The customer's email, if provided."),
  }),
  async execute(input) {
    const res = await fetch(`${appUrl()}/api/log-ticket`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      return { ok: false, error: `log-ticket workflow failed (${res.status})` };
    }
    const data = (await res.json()) as {
      ticketId: string;
      classification: TicketClassification;
      runId: string;
    };
    return { ok: true, ...data };
  },
});
