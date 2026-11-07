# Observability: Veridoc

Logs, metrics and traces for the live server, kept on the same server with open-source tools. Everything here is set up in code (`deploy/observability/`) and is created again on every deploy.

## 1. How to open it

- **Dashboards:** `https://<site-address>/grafana` (for the demo, https://16-179-13-144.sslip.io/grafana)
- **User:** `admin`
- **Password:** `GRAFANA_ADMIN_PASSWORD` in `deploy/.env` on the server. The first deploy creates it. To read it:
  ```bash
  ssh -i ~/.ssh/veridoc.pem ubuntu@<elastic-ip> "grep GRAFANA_ADMIN_PASSWORD ~/veridoc/deploy/.env"
  ```

Start with **Dashboards → Veridoc → Veridoc overview**. To look up one request, use **Explore**:
- **VictoriaTraces:** search by service (`caddy`, `veridoc-api`, `veridoc-web`, `veridoc-worker`).
- **VictoriaLogs:** filter with LogsQL, for example `service.name:api AND level:error`, or `trace_id:<id>` to find every log line from one request.

## 2. What runs where

```
api, worker, web ──OTLP──▶ otel-collector ──▶ VictoriaMetrics  (metrics, 15 days)
Caddy ────────────OTLP──▶      │          ──▶ VictoriaLogs     (logs, 7 days, max 2 GiB)
host, containers, Postgres ──▶ │          ──▶ VictoriaTraces   (traces, 3 days, max 1 GiB)
Docker log files ────────────▶ ┘                       ▲
                                         Grafana ──────┘  dashboards, alerts → email
```

| Container | Image | Memory cap | Job |
|---|---|---|---|
| `otel-collector` | otel/opentelemetry-collector-contrib 0.164.0 | 160 MB | Receives OTLP and reads host, container and Postgres stats and the Docker log files. Sends each signal to its store. |
| `victoriametrics` | victoria-metrics v1.154.1 | 256 MB | Metric store; Grafana queries it with PromQL |
| `victorialogs` | victoria-logs v1.53.0 | 192 MB | Log store; LogsQL |
| `victoriatraces` | victoria-traces v0.12.1 | 192 MB | Trace store; serves the Jaeger query API to Grafana |
| `grafana` | grafana 13.2.5 | 384 MB | Dashboards and alerting; behind Caddy at `/grafana` |

None of them publishes a port. Grafana is reached only through Caddy over HTTPS, and only after logging in.

## 3. What is collected

**Traces.** Caddy starts a trace for every request and passes it on with a `traceparent` header, so the API's or web's spans join it. The API records a span per request and per SQL statement, plus one span per Gemini call with the model and token counts. When an upload queues an extraction job, the trace context is saved with the job. The worker continues the same trace, so one trace shows an upload through to its extraction.

**Metrics.**
- Traffic: `http_server_request_duration_seconds` (API, by route template and status).
- Extraction:
  - `veridoc_jobs_count` and `veridoc_jobs_oldest_age_seconds`: queue size, and how long the oldest due job has waited.
  - `veridoc_gemini_calls_total` and `veridoc_gemini_duration_seconds`: by model and outcome. Outcomes are `ok`, `quota`, `overloaded`, `network`, `bad_schema` and `bad_status`.
  - `veridoc_extractions_total`: by document type and outcome.
  - `veridoc_field_confidence`: a histogram of final field confidence.
- Server: CPU, memory, swap, disk, network, memory and CPU per container, and Postgres connections, commits and size.

**Logs.** Every container writes JSON lines to stdout. Docker keeps them in capped files (10 MB × 3 per container) and tags each line with its compose service name. The collector reads the files and sends them to VictoriaLogs. The API and worker logs include `trace_id`, so a log line links to its trace. Caddy's access log covers every request; Caddy redacts cookies and authorisation headers itself.

## 4. Alerts

Alerts are evaluated every minute and emailed to `ALERT_EMAIL`. A rule fires only after its condition has held for the time shown.

| Alert | Condition | What to do |
|---|---|---|
| API stopped reporting | No telemetry from the API for 5 min (+3 min) | `docker compose … ps` and `logs api`. A crash loop is usually a bad migration or a missing env var. |
| Extraction worker stopped reporting | Same, for the worker | `logs worker`, then `up -d worker`. Uploads wait in the queue meanwhile; nothing is lost. |
| API errors above 5% | 5xx over 5% of ≥ 20 requests in 15 min, for 10 min | Search VictoriaLogs for `service.name:api AND level:error`. Open the trace from its `trace_id`. |
| Extraction queue stuck | Oldest due job waiting > 10 min, for 2 min | Check the worker is up and check Gemini calls by outcome. The usual cause is quota. |
| Gemini quota hit | Any 429 in the last hour | Free tier, about 20 calls per model per day. Jobs retry by themselves at the reset; the user can also type the fields by hand. |
| Gemini calls failing | More than 3 non-quota failures in 15 min, for 5 min | `bad_schema` means the prompt or model changed. `network` or `overloaded` usually means Google is having trouble. |
| Disk above 85% | For 10 min | `docker system df`. Remove old images with `docker image prune -a`. The log and trace stores cap themselves. |
| Memory above 90% | For 10 min | Use the "Memory by container" panel. Each monitoring container has a hard cap; the app containers don't. |

**Turning on email.** Create a Gmail app password (Google account → Security → 2-Step Verification → App passwords), then add these lines to `deploy/.env` on the server and redeploy:

```
SMTP_ENABLED=true
SMTP_USER=<gmail address>
SMTP_PASSWORD=<16-character app password>
ALERT_EMAIL=<where alerts go>
```

**What it can't catch.** If the whole server is down, Grafana is down with it and sends nothing. An outside uptime check (for example UptimeRobot's free plan on `/api/health`) covers that. Section 6 has more on this.

## 5. Decisions

- **Self-hosted, on the same server.** Hosted plans either needed a card or were trial-only, and the demo holds no real data. The cost is about 620 MB of RAM in use (measured; caps total 1.2 GB) on a 2 GB server, and the blind spot described above. Grafana alone is about 280 MB.
- **VictoriaMetrics, VictoriaLogs and VictoriaTraces, not Prometheus, Loki and Tempo.** Each is one small Go binary with retention and disk caps as flags. Together they run in roughly the memory Loki or Tempo alone would want. Grafana talks to them through standard APIs (PromQL, and the Jaeger query API), so swapping a store back later doesn't touch the dashboards.
- **VictoriaTraces instead of Jaeger.** We tried Jaeger 2.22 first, but it serves only its v3 query API, and Grafana's Jaeger data source still calls v2 (`/api/services` returns 404). VictoriaTraces is pre-1.0, so it is pinned to a version.
- **One collector in front of everything.** The apps only know "send OTLP to `otel-collector`". Changing a store, or moving to a hosted service later, is a change to one YAML file.
- **The collector runs as root, with read-only mounts** of `/`, the Docker socket and the container log folder. That access is needed to read host stats and other containers' logs. The collector has no published port, and the image is pinned.
- **Postgres is monitored with the app's database user.** A separate `pg_monitor` role would be stricter. Section 6 covers it.
- **Driver-level SQL tracing (psycopg).** The SQLAlchemy instrumentation doesn't support SQLAlchemy 2.1 yet. Forcing it crashed the API at start, because it imports SQLAlchemy's async module, which needs `greenlet`.

## 6. Next steps

1. An outside uptime check, so a dead server still sends an alert.
2. A `pg_monitor` role for the collector instead of the app's user.
3. Send alerts to a chat channel as well as email, and add a page for critical alerts.
4. Service-level objectives: for example, 99% of extractions finish within 2 minutes, with burn-rate alerts instead of fixed thresholds.
5. Move the monitoring stack to its own small server, or to a hosted backend. Only the collector's exporters change.
