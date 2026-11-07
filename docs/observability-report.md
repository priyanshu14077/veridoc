# Veridoc monitoring report

Generated 2026-11-07 20:55 IST from the local monitoring stack, covering the last **30m**.

## API

| Requests | 5xx | 5xx share | p95 latency |
|---|---|---|---|
| 1,404 | 0 | 0.0% | 25 ms |

**By status:** `200` 1,264, `401` 70, `404` 70

### Routes

| Route | Requests | Mean | p95 |
|---|---|---|---|
| `/api/shipments/{shipment_id}` | 910 | 13 ms | 25 ms |
| `/api/reports/accuracy` | 140 | 12 ms | 35 ms |
| `/api/shipments` | 72 | 9 ms | 23 ms |
| `/api/auth/me` | 70 | 4 ms | 9 ms |
| `/api/importers` | 70 | 5 ms | 8 ms |
| `/api/reports/overrides` | 70 | 7 ms | 17 ms |
| `/api/suppliers` | 70 | 4 ms | 8 ms |
| `/api/auth/login` | 2 | 91 ms | 235 ms |

p95 comes from histogram buckets, so it is an estimate within the bucket's range.

## Extraction

**Gemini calls by model and outcome**

_No data in this window._

**Extraction results**

_No data in this window._

- Fields below the 0.85 review threshold: **–**
- Longest any due job waited for the worker: **0 s**

## Resource cost

| Container | Part of | Memory (mean) | Memory (peak) | CPU (mean, % of a core) |
|---|---|---|---|---|
| api | app | 99 MB | 102 MB | 0.9% |
| worker | app | 81 MB | 81 MB | 0.3% |
| db | app | 51 MB | 53 MB | 0.6% |
| web | app | 48 MB | 48 MB | 0.0% |
| caddy | app | 24 MB | 24 MB | 0.0% |
| grafana | monitoring | 351 MB | 381 MB | 1.4% |
| victoriametrics | monitoring | 203 MB | 210 MB | 0.4% |
| otel-collector | monitoring | 84 MB | 90 MB | 2.7% |
| victoriatraces | monitoring | 68 MB | 98 MB | 0.6% |
| victorialogs | monitoring | 61 MB | 63 MB | 0.2% |

|  | Memory (mean) | Memory (peak) |
|---|---|---|
| **App (production)** | 303 MB | 308 MB |
| **Monitoring (local only)** | 767 MB | 842 MB |

Monitoring uses **2.5×** the memory of the app it watches. On the 2 GB production server that would leave little room for the app, which is why it runs here.

- Database size: **9 MB**, peak connections: **4**

## Alerts

| Rule | State | Health |
|---|---|---|
| API stopped reporting | inactive | ok |
| Extraction worker stopped reporting | inactive | ok |
| API errors above 5% | inactive | ok |
| Extraction queue stuck | inactive | ok |
| Gemini quota hit | inactive | ok |
| Gemini calls failing | inactive | ok |
| Disk above 85% | inactive | ok |
| Memory above 90% | inactive | ok |

## Traces

Services sending spans: `caddy`, `veridoc-api`, `veridoc-web`, `veridoc-worker`

