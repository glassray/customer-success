import { OTLPHttpProtoTraceExporter } from "@vercel/otel";
import { trace, TraceFlags, type Attributes, type Context } from "@opentelemetry/api";
import type { Sampler, SamplingResult, SpanExporter } from "@opentelemetry/sdk-trace-base";

// Root-span routes we never want as their own LangSmith trace. The big one is
// the tickets dashboard's ~1/sec `/api/tickets` poll; the rest are Next UI/asset
// and dev noise. Agent turns (`/eve/v1/session/…`), the durable workflow steps
// (`/.well-known/workflow/*`, `hook.resume`), and `/api/log-ticket` (the classify
// model call) are intentionally NOT matched here, so they're kept.
const NOISE_SUBSTRINGS = [
  "/api/tickets", // tickets dashboard poll (~1/sec)
  "/eve/v1/health", // eve dev/liveness probe
  "/_next/",
  "/__next",
  "/favicon",
  "/_not-found",
  "/.well-known/appspecific",
  "registry.npmjs.org", // Next dev package-version checks
];

// Next UI page navigations. The route-resolved span *name* ("GET /tickets")
// isn't set until after the sampling decision, so we match the request *path*
// (available at span start via http.target / url.full) exactly instead.
const NOISE_EXACT_PATHS = new Set(["/", "/tickets", "/inbox", "/_not-found"]);
const PAGE_NAV_SPAN = /^(RSC )?(GET|HEAD) \/(tickets|inbox|_not-found)?$/;

/** Extract the request path (no origin, no query) from whatever URL-ish attribute is present. */
function requestPath(attributes: Attributes): string | undefined {
  for (const key of ["http.target", "url.path", "http.url", "url.full"]) {
    const raw = attributes[key];
    if (typeof raw !== "string") continue;
    const withoutOrigin = raw.replace(/^https?:\/\/[^/]+/, "");
    return withoutOrigin.split("?")[0] || "/";
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
 * A parent-based sampler that drops whole traces rooted at noisy routes (see
 * {@link NOISE_ROUTE_MARKERS}) and keeps everything else. Child spans follow the
 * root's decision, so a kept trace keeps all its spans and a dropped one drops
 * all of them — no orphans.
 *
 * `SamplingDecision`: 0 = NOT_RECORD (drop), 2 = RECORD_AND_SAMPLED (keep).
 */
export function noiseFilteringSampler(): Sampler {
  return {
    shouldSample(context: Context, _traceId, spanName, _spanKind, attributes): SamplingResult {
      const parent = trace.getSpanContext(context);
      if (parent) {
        const sampled = (parent.traceFlags & TraceFlags.SAMPLED) !== 0;
        return { decision: sampled ? 2 : 0 };
      }
      return { decision: isNoiseRoot(spanName, attributes) ? 0 : 2 };
    },
    toString: () => "NoiseFilteringSampler",
  };
}

/**
 * Builds an OpenTelemetry trace exporter that ships spans to LangSmith's OTLP
 * ingestion endpoint.
 *
 * Both processes that call the model register this: the eve agent server (via
 * `agent/instrumentation.ts`) and the Next.js app that runs the logging
 * workflow (via the root `instrumentation.ts`). Sending both to the same
 * `LANGSMITH_PROJECT` groups a conversation and its ticket-classification calls
 * in one place. eve renames its model/tool spans to GenAI semantic conventions
 * (`invoke_agent`, `chat`, `execute_tool`), which LangSmith's OTEL ingestion
 * maps to LLM/tool runs automatically.
 *
 * We export complete traces rather than filtering to AI-only spans: LangSmith
 * builds its run tree from the full trace, so dropping the non-AI parent spans
 * would orphan (and discard) the AI children. To cut down on non-AI traces
 * (e.g. the tickets dashboard's `/api/tickets` polling), filter by run name in
 * the LangSmith UI, or narrow the instrumented surface.
 *
 * Returns `undefined` when `LANGSMITH_API_KEY` is absent, so tracing is a no-op
 * until a key is configured — the app runs fine without one.
 */
export function langsmithTraceExporter(): SpanExporter | undefined {
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (!apiKey) return undefined;

  // Default US endpoint; override with LANGSMITH_OTEL_ENDPOINT for EU/APAC/self-hosted.
  const base = (process.env.LANGSMITH_OTEL_ENDPOINT ?? "https://api.smith.langchain.com/otel").replace(
    /\/+$/,
    "",
  );

  return new OTLPHttpProtoTraceExporter({
    url: `${base}/v1/traces`,
    headers: {
      "x-api-key": apiKey,
      "Langsmith-Project": process.env.LANGSMITH_PROJECT ?? "customer-success",
    },
  });
}
