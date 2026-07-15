/**
 * Ticket store backed by Upstash Redis (Vercel Marketplace).
 *
 * A shared store is required for the two-way handoff on Vercel: the customer's
 * web session and the inbound Slack webhook run in different function
 * invocations, so the bridge (ticket <-> web session <-> Slack thread <->
 * continuation token) must live somewhere both can reach.
 *
 * The exported interface is identical to the earlier JSON-file version, so
 * tools, workflow steps, and API routes are unchanged.
 */
import { Redis } from "@upstash/redis";

export type TicketStatus = "open" | "resolved" | "escalated" | "answered";
export type TicketType = "bug" | "feedback" | "question";
export type Severity = "low" | "medium" | "high";

export interface TicketClassification {
  type: TicketType;
  severity: Severity;
  /** Product area, e.g. "Deployments", "Builds", "Domains", "Billing". */
  area: string;
  /** Whether eve should be able to resolve this without a human. */
  canAutoResolve: boolean;
  rationale: string;
}

export interface TicketEvent {
  at: string;
  actor: "customer" | "eve" | "human";
  text: string;
}

export interface Ticket {
  id: string;
  createdAt: string;
  summary: string;
  body: string;
  reporterEmail?: string;
  status: TicketStatus;
  classification?: TicketClassification;
  /** Customer's eve web session id — the relay target for a human reply. */
  webSessionId?: string;
  /** Slack thread anchor (production human surface). */
  slackThreadTs?: string;
  escalationReason?: string;
  resolution?: string;
  events: TicketEvent[];
}

export interface NewTicketInput {
  summary: string;
  body: string;
  reporterEmail?: string;
}

// The Vercel Upstash integration injects KV_REST_API_*; fall back to the
// SDK's native names if present.
const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "",
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
});

const K = {
  seq: "vs:seq",
  ids: "vs:ticket_ids",
  ticket: (id: string) => `vs:ticket:${id}`,
  cont: (sessionId: string) => `vs:cont:${sessionId}`,
  slackThread: (ts: string) => `vs:slackthread:${ts}`,
};

export async function createTicket(input: NewTicketInput): Promise<Ticket> {
  const seq = await redis.incr(K.seq);
  const id = `VS-${100 + seq}`;
  const now = new Date().toISOString();
  const ticket: Ticket = {
    id,
    createdAt: now,
    summary: input.summary,
    body: input.body,
    reporterEmail: input.reporterEmail,
    status: "open",
    events: [{ at: now, actor: "customer", text: input.body }],
  };
  await redis.set(K.ticket(id), ticket);
  await redis.sadd(K.ids, id);
  return ticket;
}

export async function getTicket(id: string): Promise<Ticket | undefined> {
  return (await redis.get<Ticket>(K.ticket(id))) ?? undefined;
}

export async function listTickets(): Promise<Ticket[]> {
  const ids = await redis.smembers(K.ids);
  if (ids.length === 0) return [];
  const tickets = await redis.mget<Ticket[]>(...ids.map(K.ticket));
  return tickets
    .filter((t): t is Ticket => Boolean(t))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateTicket(
  id: string,
  patch: Partial<Ticket>,
): Promise<Ticket | undefined> {
  const existing = await redis.get<Ticket>(K.ticket(id));
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  await redis.set(K.ticket(id), next);
  // Keep the reverse index for Slack thread -> ticket lookups.
  if (patch.slackThreadTs) await redis.set(K.slackThread(patch.slackThreadTs), id);
  return next;
}

export async function addEvent(id: string, event: TicketEvent): Promise<Ticket | undefined> {
  const existing = await redis.get<Ticket>(K.ticket(id));
  if (!existing) return undefined;
  existing.events.push(event);
  await redis.set(K.ticket(id), existing);
  return existing;
}

export async function findBySlackThread(threadTs: string): Promise<Ticket | undefined> {
  const id = await redis.get<string>(K.slackThread(threadTs));
  return id ? getTicket(id) : undefined;
}

/** Record the latest continuation token for a web session (captured in the eve channel). */
export async function setContinuation(sessionId: string, token: string): Promise<void> {
  await redis.set(K.cont(sessionId), token);
}

export async function getContinuation(sessionId: string): Promise<string | undefined> {
  return (await redis.get<string>(K.cont(sessionId))) ?? undefined;
}
