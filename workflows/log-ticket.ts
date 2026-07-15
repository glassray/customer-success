/**
 * The dedicated ticket-logging Vercel Workflow.
 *
 * eve triages the conversation; this durable workflow is what actually LOGS
 * every ticket. It runs as its own observable run (see `npx workflow web`):
 *   1. openTicket   — assign an id and persist the ticket (open)
 *   2. classify     — an AI step (Claude via AI Gateway) categorizes it
 *   3. apply        — persist the classification back onto the ticket
 *
 * The `log_ticket` tool starts this workflow and awaits its return value, so
 * eve gets the classification back and uses it to decide: resolve or escalate.
 */
import { generateObject } from "ai";
import { z } from "zod";
import {
  createTicket,
  type NewTicketInput,
  type TicketClassification,
  updateTicket,
} from "../lib/store";

const classificationSchema = z.object({
  type: z.enum(["bug", "feedback", "question"]),
  severity: z.enum(["low", "medium", "high"]),
  area: z
    .string()
    .describe('Vercel product area, e.g. "Deployments", "Builds", "Domains", "Billing"'),
  canAutoResolve: z
    .boolean()
    .describe(
      "True if a support agent can resolve this from documentation/known guidance alone; " +
        "false if it needs a human (real product bug, outage, account/billing, data loss, security).",
    ),
  rationale: z.string().describe("One sentence explaining the classification."),
});

async function openTicket(input: NewTicketInput): Promise<{ id: string }> {
  "use step";
  const ticket = await createTicket(input);
  return { id: ticket.id };
}

async function classify(input: NewTicketInput): Promise<TicketClassification> {
  "use step";
  const { object } = await generateObject({
    model: "anthropic/claude-sonnet-5",
    schema: classificationSchema,
    // Emit an OpenTelemetry span for this model call so it shows up in LangSmith
    // (exported by the root instrumentation.ts). No-op unless telemetry is on.
    experimental_telemetry: { isEnabled: true, functionId: "classify-ticket" },
    prompt:
      "You triage inbound customer support tickets for Vercel (the deployment platform).\n" +
      "Classify this ticket.\n\n" +
      "Set canAutoResolve=true for common how-to / configuration / documentation questions " +
      "(build errors, environment variables, custom domains, redeploys, caching/ISR, framework setup).\n" +
      "Set canAutoResolve=false when it needs a human: a genuine product bug or regression, a " +
      "suspected outage, billing/account/plan changes, data loss, or anything security-sensitive.\n\n" +
      `Summary: ${input.summary}\n` +
      `Details: ${input.body}`,
  });
  return object;
}

async function apply(id: string, classification: TicketClassification): Promise<void> {
  "use step";
  await updateTicket(id, { classification });
}

export async function logTicketWorkflow(
  input: NewTicketInput,
): Promise<{ ticketId: string; classification: TicketClassification }> {
  "use workflow";

  const { id } = await openTicket(input);
  const classification = await classify(input);
  await apply(id, classification);

  return { ticketId: id, classification };
}
