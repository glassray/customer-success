import { OTLPHttpProtoTraceExporter } from "@vercel/otel";
import { trace, TraceFlags, type Attributes, type Context } from "@opentelemetry/api";
import type { ReadableSpan, Sampler, SamplingResult, SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { ExportResult } from "@opentelemetry/core";

// ── Trace-level noise filter (sampler) ──────────────────────────────────────
// Root-span routes we never want as their own LangSmith trace: the tickets
// dashboard poll, Next UI/asset requests, health/liveness probes.
const NOISE_SUBSTRINGS = [
  "/api/tickets",
  "/eve/v1/health",
  "/_next/",
  "/__next",
  "/favicon",
  "/_not-found",
  "/.well-known/appspecific",
  "registry.npmjs.org",
];
const NOISE_EXACT_PATHS = new Set(["/", "/tickets", "/inbox", "/_not-found"]);
const PAGE_NAV_SPAN = /^(RSC )?(GET|HEAD) \/(tickets|inbox|_not-found)?$/;

function requestPath(attributes: Attributes): string | undefined {
  for (const key of ["http.target", "url.path", "http.url", "url.full"]) {
    const raw = attributes[key];
    if (typeof raw !== "string") continue;
    return raw.replace(/^https?:\/\/[^/]+/, "").split("?")[0] || "/";
  }
  return undefined;
}

function isNoiseRoot(spanName: string, attributes: Attributes): boolean {
  if (PAGE_NAV_SPAN.test(spanName.trim())) return true;
  const path = requestPath(attributes);
  if (path && NOISE_EXACT_PATHS.has(path)) return true;
  const haystack = [spanName, path, attributes["http.route"], attributes["next.route"]]
    .filter((v): v is string => typeof v === "string")
    .join(" ");
  return NOISE_SUBSTRINGS.some((marker) => haystack.includes(marker));
}

/**
 * Parent-based sampler that drops whole traces rooted at noisy routes and keeps
 * everything else. Cheap first pass so pure-noise traces (dashboard polling,
 * page loads) never even reach the exporter. `SamplingDecision`: 0 = drop, 2 = keep.
 */
export function noiseFilteringSampler(): Sampler {
  return {
    shouldSample(context: Context, _traceId, spanName, _spanKind, attributes): SamplingResult {
      const parent = trace.getSpanContext(context);
      if (parent) return { decision: (parent.traceFlags & TraceFlags.SAMPLED) !== 0 ? 2 : 0 };
      return { decision: isNoiseRoot(spanName, attributes) ? 0 : 2 };
    },
    toString: () => "NoiseFilteringSampler",
  };
}

// ── Chat-only span filter (exporter) ────────────────────────────────────────
// Keep ONLY the chat-conversation spans and drop everything else: the durable
// workflow plumbing (`workflow.*`, `world.*`, `step.*`, `hook.resume`), HTTP/fetch
// spans, AND the ticket-classification model call (`ai.generateObject`). eve
// renames the agent's spans to GenAI conventions, so the conversation is:
//   ai.eve.turn → invoke_agent → chat (model)   ·   execute_tool <name>
const CHAT_SPAN_PREFIXES = ["ai.eve.turn", "invoke_agent", "chat ", "execute_tool"];

function isChatSpan(span: ReadableSpan): boolean {
  const name = span.name;
  // The classify step is a model call too, but it's not a chat interaction.
  if (name.startsWith("ai.generateObject")) return false;
  return CHAT_SPAN_PREFIXES.some((p) => name === p || name.startsWith(p));
}

function parentIdOf(span: ReadableSpan): string | undefined {
  return span.parentSpanContext?.spanId ?? (span as { parentSpanId?: string }).parentSpanId;
}

/** Return a view of `span` with no parent, so LangSmith treats it as a trace root. */
function asRoot(span: ReadableSpan): ReadableSpan {
  return new Proxy(span, {
    get(target, prop, receiver) {
      if (prop === "parentSpanContext" || prop === "parentSpanId") return undefined;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as ReadableSpan;
}

/**
 * SpanExporter decorator that forwards only chat-conversation spans, re-rooting
 * any whose parent was dropped. Result: one clean LangSmith trace per turn —
 * the customer message, Eve's reply, and each tool call — with no durable-workflow
 * or HTTP plumbing around it.
 */
class ChatOnlyExporter implements SpanExporter {
  constructor(private readonly inner: SpanExporter) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    const kept = spans.filter(isChatSpan);
    if (kept.length === 0) {
      resultCallback({ code: 0 /* SUCCESS */ });
      return;
    }
    const keptIds = new Set(kept.map((s) => s.spanContext().spanId));
    // Re-root any chat span whose parent isn't itself a chat span (its real parent
    // was workflow/HTTP plumbing we dropped), so the kept subtree stays valid.
    const processed = kept.map((s) => {
      const pid = parentIdOf(s);
      return pid && keptIds.has(pid) ? s : asRoot(s);
    });
    this.inner.export(processed, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve();
  }
}

/**
 * Builds the LangSmith OTLP exporter, wrapped to ship only chat interactions.
 *
 * Registered in both processes that call the model — the eve agent server
 * (`agent/instrumentation.ts`) and the Next.js app (`instrumentation.ts`) — both
 * targeting `LANGSMITH_PROJECT`. Returns `undefined` when `LANGSMITH_API_KEY` is
 * absent, so tracing no-ops until a key is configured.
 */
export function langsmithTraceExporter(): SpanExporter | undefined {
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (!apiKey) return undefined;

  // Default US endpoint; override with LANGSMITH_OTEL_ENDPOINT for EU/APAC/self-hosted.
  const base = (process.env.LANGSMITH_OTEL_ENDPOINT ?? "https://api.smith.langchain.com/otel").replace(
    /\/+$/,
    "",
  );

  const otlp = new OTLPHttpProtoTraceExporter({
    url: `${base}/v1/traces`,
    headers: {
      "x-api-key": apiKey,
      "Langsmith-Project": process.env.LANGSMITH_PROJECT ?? "customer-success",
    },
  });

  return new ChatOnlyExporter(otlp);
}
