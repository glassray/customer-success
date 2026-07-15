# Vercel Support Agent — built on eve

An autonomous customer-support agent for **Vercel**, built on [**eve**](https://vercel.com/docs/eve)
(Vercel's filesystem-first agent framework). Customers report bugs or share feedback in a web
chat; **Eve** triages every message, **logs each ticket through a durable Vercel Workflow**,
**resolves** what it can from documentation, and **escalates to a human in Slack** — with a
**two-way handoff** that relays the human's reply back into the customer's live chat.

## How it works

```
Customer (web chat, useEveAgent)
   │
   ▼
Eve agent ──log_ticket──▶ /api/log-ticket ──▶ Workflow: openTicket → classify (Claude) → persist ──▶ Upstash Redis
   │
   ├─ can resolve?  ──▶ answer + resolve_ticket
   └─ needs a human ──▶ escalate_to_human ──▶ Slack #support thread
                                                    │
                        human replies in Slack ─────┘
                                                    ▼
                        relay_to_customer ──▶ back into the customer's parked session ("answered")
```

- **eve** owns the conversation, triage, resolution, and handoff (the `agent/` directory).
- **Workflow DevKit** owns the durable, observable ticket log + AI classification (`workflows/`).
- **Upstash Redis** is the shared store that bridges the customer's web session and the Slack
  thread (required because those run in different serverless functions).
- **Claude** (`anthropic/claude-sonnet-5`) is reached through the **Vercel AI Gateway**.

> **Runtime note:** eve compiles to its **own server** and the Next.js app rewrites `/eve/v1/*`
> to it. Both ship inside **one** Vercel deployment as two functions — the Next app (UI, `/api/*`,
> the workflow) and the eve agent. This is why `start()` for the logging workflow lives in a Next
> API route (where the Workflow build transform runs) and the eve tool calls it over HTTP.

## Prerequisites

- **Node.js 24+**
- A **Vercel account** and the **Vercel CLI** (`npm i -g vercel@latest`)
- An **AI Gateway API key** (free) — or use Vercel OIDC via `npx eve link`
- *(Optional, for the Slack handoff)* a **Slack workspace** where you can authorize Vercel's
  managed Slack app

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Link the project to Vercel
vercel link

# 3. Provision the ticket store (Upstash Redis, via the Vercel Marketplace)
#    Finish the plan/region step in the browser it opens.
#    This auto-adds KV_REST_API_URL and KV_REST_API_TOKEN to the project.
vercel integration add upstash/upstash-kv

# 4. Give the agent model access (AI Gateway). Either:
#    a) create a key at https://vercel.com/dashboard/ai/api-keys and add it to the project:
vercel env add AI_GATEWAY_API_KEY
#    b) …or use OIDC instead of a key:
#    npx eve link
```

### Slack (optional — enables the two-way human handoff)

Slack events are delivered to your **deployed** URL, so this only works on a deployment, not
localhost.

```bash
vercel connect create slack --triggers
vercel connect detach <uid> --yes
vercel connect attach <uid> --triggers --trigger-path /eve/v1/slack --yes
vercel env add SLACK_SUPPORT_CHANNEL_ID   # the channel escalations post to (e.g. C0123ABC456)
```

Then invite the bot to that channel (`/invite @YourBot`). If your connector UID isn't
`slack/customer-success`, also set `SLACK_CONNECTOR` to match (`vercel connect ls`).

Without Slack configured, escalations route to the built-in **Support Inbox** at `/inbox`, which
demonstrates the same two-way relay locally.

### Environment variables

| Variable | Required | Purpose | Where it comes from |
| --- | --- | --- | --- |
| `AI_GATEWAY_API_KEY` | Yes¹ | Claude via AI Gateway (agent + the classify step) | vercel.com/dashboard/ai/api-keys |
| `KV_REST_API_URL` | Yes | Upstash Redis (ticket store) | auto-added by the Upstash integration |
| `KV_REST_API_TOKEN` | Yes | Upstash Redis | auto-added by the Upstash integration |
| `SLACK_SUPPORT_CHANNEL_ID` | No | Channel escalations post to; omit → `/inbox` | your Slack channel id |
| `SLACK_CONNECTOR` | No | Vercel Connect connector UID (default `slack/customer-success`) | `vercel connect ls` |
| `EVE_HOST` | No | Override base URL for internal calls (default: Vercel URL, else `localhost:PORT`) | — |

¹ Not needed if you use `npx eve link` (OIDC) instead.

## Run locally

Create `.env.local` with the three core vars (the store is shared with your deployment):

```bash
AI_GATEWAY_API_KEY=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

> Tip: `vercel env pull .env.local` fetches these, but also pulls Vercel **system** vars
> (`VERCEL`, `VERCEL_URL`, `VERCEL_OIDC_TOKEN`, …). Delete those from `.env.local` — `VERCEL=1`
> stops eve's local dev server from starting and `VERCEL_URL` misroutes internal calls.

```bash
npm run dev      # Next.js + the eve dev server; open http://localhost:3000
```

Drive it from the **browser** — the local eve dev server advances a turn while a client is
attached to its stream. (Deployed, turns run server-side on Vercel Workflows.)

Pages: `/` chat · `/tickets` dashboard · `/inbox` support inbox.

## Deploy

```bash
VERCEL_USE_EXPERIMENTAL_FRAMEWORKS=1 vercel deploy --prod
```

The `VERCEL_USE_EXPERIMENTAL_FRAMEWORKS=1` flag tells the build to treat eve as a framework and
emit the eve function alongside the Next app. (`eve deploy` sets this for you.)

## Project structure

```
agent/
  agent.ts                 model config (anthropic/claude-sonnet-5)
  instructions.md          persona + triage/resolve/escalate rules
  tools/
    log_ticket.ts          → starts the logging workflow (via /api/log-ticket)
    resolve_ticket.ts      → mark a ticket resolved
    escalate_to_human.ts   → link the session + post to Slack
    relay_to_customer.ts   → relay a human's reply into the customer's chat
    get_ticket.ts          → read one ticket
    list_tickets.ts        → search/list tickets
  channels/
    eve.ts                 web channel (captures the continuation token for relay)
    slack.ts               Slack channel (human handoff)
workflows/
  log-ticket.ts            Workflow DevKit: openTicket → classify (AI) → apply
lib/
  store.ts                 Upstash Redis ticket store
  relay.ts, handoff.ts     two-way relay into a parked session
  slack.ts, app-url.ts     helpers
app/
  page.tsx, _components/   web chat (useEveAgent)
  tickets/, inbox/         dashboard + human inbox
  api/log-ticket, api/relay, api/tickets
next.config.ts             withEve(withWorkflow(...))
```

## Notes

- The ticket store is **Upstash Redis** so the bridge (ticket ↔ web session ↔ Slack thread ↔
  continuation token) survives across serverless functions.
- Adding a capability is usually one file: a tool in `agent/tools/`, or a markdown skill in
  `agent/skills/` that eve loads on demand.
