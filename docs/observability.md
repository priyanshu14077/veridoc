# Observability: Veridoc

Logs, metrics and traces for Veridoc, using open-source tools that run **on a developer's machine, not in production**. Everything is set up in code (`deploy/compose.observability.yml` and `deploy/observability/`). It runs on top of the same production compose file, so what you measure is the real production stack.

## 1. Why it isn't deployed

The production server is one 2 GB EC2 instance running a demo with fictional data. A measured run ([observability-report.md](observability-report.md)) showed the monitoring stack using about **770 MB, 2.5× the memory of the app it watches** (about 300 MB). On that server it would take the room Postgres and the API need under load. It would also share the app's fate: if the server dies, the monitoring dies with it and can't send an alert.

Production still keeps the cheap parts:

| In production | Why it's enough for a demo |
|---|---|
| JSON logs from every container, capped at 10 MB × 3 per container | `docker compose logs api` is searchable with `grep` and `jq`, and the disk can't fill up |
| Health checks on every app container, and `up --wait` on deploy | A deploy that doesn't come up healthy fails the CI job |
| A live smoke test after every deploy (CI) | Proves the site, the login and HTTPS work on the real server |
| OpenTelemetry in the code, switched off | Pointing `OTEL_EXPORTER_OTLP_ENDPOINT` at any collector turns it on without a code change |

When Veridoc has real users, section 7 explains how to run monitoring in production properly.

## 2. How to run it (macOS, Docker Desktop)

Prerequisites: Docker Desktop running, with at least 4 GB of memory under **Settings → Resources**.

1. Create `deploy/.env` once:
   ```bash
   cp deploy/.env.example deploy/.env
   ```
   Set `SITE_ADDRESS=localhost` and `POSTGRES_PASSWORD=` to the output of `openssl rand -hex 24`. To see extraction metrics, also set `GEMINI_API_KEY`. `GRAFANA_ADMIN_PASSWORD` is optional; when it's empty the password is `admin`.
2. Start everything (the first build takes a few minutes):
   ```bash
   deploy/observability/run.sh up
   ```
3. Open the app at https://localhost (accept the local certificate warning) and log in with `anil.manager@veridoc.demo` / `veridoc-demo`. Upload a document or two from `sample-docs/` to exercise the extraction pipeline.
4. Open Grafana at http://localhost:3001 (user `admin`) → **Dashboards → Veridoc → Veridoc overview**.
5. Optionally, generate steady API traffic: `deploy/observability/run.sh traffic 100`.
6. Write a report:
   ```bash
   deploy/observability/run.sh report 1h > docs/observability-report.md
   ```
7. Stop it with `deploy/observability/run.sh down`. The data volumes are kept for next time.

`run.sh` passes any other argument to Docker Compose with both files, for example `run.sh ps` or `run.sh logs -f worker`.

To look up one request, use **Explore**:
- **VictoriaTraces:** search by service (`caddy`, `veridoc-api`, `veridoc-web`, `veridoc-worker`).
- **VictoriaLogs:** filter with LogsQL, for example `service.name:api AND level:error`, or `trace_id:<id>` for every log line from one request.

## 3. What runs where

```
api, worker, web ──OTLP──▶ otel-collector ──▶ VictoriaMetrics  (metrics, 15 days)   127.0.0.1:8428
Caddy ────────────OTLP──▶      │          ──▶ VictoriaLogs     (logs, 7 days)
host, containers, Postgres ──▶ │          ──▶ VictoriaTraces   (traces, 3 days)
Docker log files ────────────▶ ┘                       ▲
                                         Grafana ──────┘  dashboard, alerts       127.0.0.1:3001
```

| Container | Image | Memory cap | Job |
|---|---|---|---|
| `otel-collector` | otel/opentelemetry-collector-contrib 0.164.0 | 160 MB | Receives OTLP; reads host, container and Postgres stats and the Docker log files; sends each signal to its store |
| `victoriametrics` | victoria-metrics v1.154.1 | 256 MB | Metric store (PromQL); also read by `run.sh report` |
| `victorialogs` | victoria-logs v1.53.0 | 192 MB | Log store (LogsQL) |
| `victoriatraces` | victoria-traces v0.12.1 | 192 MB | Trace store; serves the Jaeger query API to Grafana |
| `grafana` | grafana 13.2.5 | 384 MB | Dashboard and alert rules |

The overlay also sets `OTEL_EXPORTER_OTLP_ENDPOINT` on the API, worker and web, and mounts `deploy/observability/caddy/tracing.caddy` into Caddy. The production Caddyfile imports `/etc/caddy/local.d/*.caddy`; in production nothing matches, so Caddy logs one warning at start and skips it. Ports are bound to `127.0.0.1`, so nothing is reachable from the network.

On a Mac, "host" metrics describe Docker Desktop's Linux VM, not macOS.

## 4. What is collected

**Traces.** Caddy starts a trace for every request and passes it on with a `traceparent` header, so the API's and web's spans join it. The API records a span per request and per SQL statement, plus one span per Gemini call with the model and token counts. When an upload queues an extraction job, the trace context is saved with the job. The worker continues the same trace, so one trace shows an upload through to its extraction.

**Metrics.**
- Traffic: `http_server_request_duration_seconds` (API, by route template and status).
- Extraction:
  - `veridoc_jobs_count` and `veridoc_jobs_oldest_age_seconds`: queue size, and how long the oldest due job has waited.
  - `veridoc_gemini_calls_total` and `veridoc_gemini_duration_seconds`: by model and outcome. Outcomes are `ok`, `quota`, `overloaded`, `network`, `bad_schema` and `bad_status`.
  - `veridoc_extractions_total`: by document type and outcome.
  - `veridoc_field_confidence`: a histogram of final field confidence.
- Server: CPU, memory, disk, network, memory and CPU per container, and Postgres connections, commits and size.

**Logs.** Every container writes JSON lines to stdout. Docker keeps them in capped files and tags each line with its compose service name. The collector reads the files and sends them to VictoriaLogs. API and worker logs include `trace_id`, so a log line links to its trace. Caddy redacts cookies and authorisation headers in its access log.

## 5. Alert rules

The eight rules are evaluated every minute and show under **Alerting → Alert rules** in Grafana. Locally there's no mail server, so nothing is emailed; the rules exist to prove the conditions are right, and they move unchanged to a production setup.

| Alert | Condition | What to do |
|---|---|---|
| API stopped reporting | No telemetry from the API for 5 min (+3 min) | `run.sh ps` and `run.sh logs api`. A crash loop is usually a bad migration or a missing env var. |
| Extraction worker stopped reporting | Same, for the worker | `run.sh logs worker`, then `run.sh up -d worker`. Uploads wait in the queue; nothing is lost. |
| API errors above 5% | 5xx over 5% of ≥ 20 requests in 15 min, for 10 min | Search VictoriaLogs for `service.name:api AND level:error` and open the trace from its `trace_id`. |
| Extraction queue stuck | Oldest due job waiting > 10 min, for 2 min | Check the worker is up and check Gemini calls by outcome. The usual cause is quota. |
| Gemini quota hit | Any 429 in the last hour | Free tier, about 20 calls per model per day. Jobs retry at the reset; users can type fields by hand. |
| Gemini calls failing | More than 3 non-quota failures in 15 min, for 5 min | `bad_schema` means the prompt or model changed. `network` or `overloaded` usually means Google is having trouble. |
| Disk above 85% | For 10 min | `docker system df`, then `docker image prune -a`. |
| Memory above 90% | For 10 min | Use the "Memory by container" panel. |

The "worker stopped reporting" rule was tested by stopping the worker: it went pending after 6 minutes and fired after 9.

## 6. Decisions

- **Local only, as an overlay.** One compose file describes production; the overlay adds monitoring without copying it. CI starts both together, so the overlay can't drift from production. A separate CI step checks that the production file contains only the five app services.
- **VictoriaMetrics, VictoriaLogs and VictoriaTraces, not Prometheus, Loki and Tempo.** Each is one small Go binary with retention and disk caps as flags. Grafana talks to them through standard APIs (PromQL and the Jaeger query API), so swapping a store doesn't touch the dashboard.
- **VictoriaTraces instead of Jaeger.** Jaeger 2.22 serves only its v3 query API, and Grafana's Jaeger data source still calls v2 (`/api/services` returns 404). VictoriaTraces is pre-1.0, so it is pinned.
- **One collector in front of everything.** The apps only know "send OTLP to this endpoint". Moving to a hosted backend is a change to the collector's exporters.
- **The collector runs as root with read-only mounts** of `/`, the Docker socket and the container log folder, to read host stats and other containers' logs. Acceptable on a laptop; in production it would get a narrower setup (section 7).
- **Driver-level SQL tracing (psycopg).** The SQLAlchemy instrumentation doesn't support SQLAlchemy 2.1 yet. Forcing it crashed the API at start, because it imports SQLAlchemy's async module, which needs `greenlet`.

## 7. Taking it to production later

1. **Off the app server.** Run the collector as the only extra container on the app server and send to a separate monitoring box, or to a hosted backend (Grafana Cloud, Honeycomb, Axiom). Only the collector's exporters change.
2. **An outside uptime check** on `/api/health`, so a dead server still raises an alert.
3. **Email or chat alerts.** Add an SMTP or webhook contact point to `deploy/observability/grafana/alerting/alerts.yaml`.
4. **A `pg_monitor` role** for the collector instead of the app's database user.
5. **Service-level objectives**, for example 99% of extractions finish within 2 minutes, with burn-rate alerts instead of fixed thresholds.
