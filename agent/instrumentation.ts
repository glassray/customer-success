import { defineInstrumentation } from "eve/instrumentation";
import { registerOTel } from "@vercel/otel";
import { langsmithTraceExporter, noiseFilteringSampler } from "../lib/langsmith-otel";

/**
 * Traces every eve agent turn to LangSmith over OpenTelemetry.
 *
 * eve auto-discovers this file and runs `setup` at server startup, then feeds
 * enriched telemetry into its AI SDK calls — so each turn's model calls and
 * tool executions (`log_ticket`, `resolve_ticket`, `escalate_to_human`, ...)
 * appear as a nested trace. The presence of this file enables telemetry; when
 * `LANGSMITH_API_KEY` is unset the exporter is undefined and nothing ships.
 *
 * The Next.js app's own model call (the workflow's classify step) is traced
 * separately in the root `instrumentation.ts` — it runs in a different process.
 */
export default defineInstrumentation({
  setup: ({ agentName }) => {
    const traceExporter = langsmithTraceExporter();
    if (!traceExporter) return;
    registerOTel({ serviceName: agentName, traceExporter, traceSampler: noiseFilteringSampler() });
  },
});
