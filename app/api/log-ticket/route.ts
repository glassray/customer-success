import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { logTicketWorkflow } from "@/workflows/log-ticket";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Starts the ticket-logging Workflow and returns its result.
 *
 * This runs in the Next.js build, where `withWorkflow` has transformed the
 * `"use workflow"` file — so `start()` recognizes it. The eve `log_ticket`
 * tool calls this over HTTP (eve runs in a separate server that doesn't have
 * the workflow transform).
 */
export async function POST(request: Request) {
  const input = (await request.json()) as {
    summary?: string;
    body?: string;
    reporterEmail?: string;
  };
  if (!input.summary || !input.body) {
    return NextResponse.json({ error: "summary and body are required" }, { status: 400 });
  }

  const run = await start(logTicketWorkflow, [
    { summary: input.summary, body: input.body, reporterEmail: input.reporterEmail },
  ]);
  const result = await run.returnValue;

  return NextResponse.json({ ...result, runId: run.runId });
}
