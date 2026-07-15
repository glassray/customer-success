import { NextResponse } from "next/server";
import { listTickets } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const tickets = await listTickets();
  return NextResponse.json({ tickets });
}
