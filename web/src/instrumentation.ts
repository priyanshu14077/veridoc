import { registerOTel } from "@vercel/otel";

// Server-side spans for page renders, sent to the collector when OTEL_EXPORTER_OTLP_ENDPOINT is
// set (deploy/compose.yml). Without it, as in `next dev`, no exporter is configured.
export function register() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  registerOTel({ serviceName: "veridoc-web" });
}
