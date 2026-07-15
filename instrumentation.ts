import { registerOTel } from "@vercel/otel";
import { langsmithTraceExporter, noiseFilteringSampler } from "./lib/langsmith-otel";

/**
 * Next.js instrumentation hook (auto-run once per server process).
 *
 * Traces the model call made *inside the Next app* — the ticket-classification
 * `generateObject` step in the logging workflow (`workflows/log-ticket.ts`) —
 * to LangSmith. The eve agent runs in its own server and is instrumented in
 * `agent/instrumentation.ts`; both target the same LangSmith project.
 *
 * No-op without `LANGSMITH_API_KEY`.
 */
export function register() {
  const traceExporter = langsmithTraceExporter();
  if (!traceExporter) return;
  registerOTel({
    serviceName: "customer-success-workflow",
    traceExporter,
    traceSampler: noiseFilteringSampler(),
  });
}
