import { NextResponse } from "next/server";
import { answerTicket } from "@/lib/handoff";

export const dynamic = "force-dynamic";

/**
 * Support Inbox → relay a human specialist's reply into the customer's chat.
 * This is the local stand-in for a human replying in Slack.
 */
export async function POST(request: Request) {
  const { ticketId, message } = (await request.json()) as {
    ticketId?: string;
    message?: string;
  };
  if (!ticketId || !message?.trim()) {
    return NextResponse.json({ ok: false, error: "ticketId and message are required" }, { status: 400 });
  }

  const result = await answerTicket(ticketId, message.trim());
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
