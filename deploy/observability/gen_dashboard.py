"""Writes the Grafana dashboard. Run from the repo root after editing:
    python3 deploy/observability/gen_dashboard.py > deploy/observability/grafana/dashboards/veridoc.json
"""

import json
import sys

VM = {"type": "prometheus", "uid": "vm"}
VL = {"type": "victoriametrics-logs-datasource", "uid": "vlogs"}
API = 'service_name="veridoc-api"'

panels: list[dict] = []
y = 0
pid = 0


def _id() -> int:
    global pid
    pid += 1
    return pid


def row(title: str) -> None:
    global y
    panels.append({"type": "row", "title": title, "id": _id(), "collapsed": False,
                   "gridPos": {"h": 1, "w": 24, "x": 0, "y": y}, "panels": []})
    y += 1


def place(items: list[tuple[dict, int]], h: int = 8) -> None:
    """items: (panel, width); laid out left to right on one row of the grid."""
    global y
    x = 0
    for p, w in items:
        p["gridPos"] = {"h": h, "w": w, "x": x, "y": y}
        panels.append(p)
        x += w
    y += h


def ts(title: str, exprs: list[tuple[str, str]], unit: str = "short", desc: str = "",
       stack: bool = False, thresholds: list | None = None) -> dict:
    p = {
        "type": "timeseries", "title": title, "id": _id(), "datasource": VM, "description": desc,
        "targets": [{"refId": chr(65 + i), "datasource": VM, "expr": e, "legendFormat": lg}
                    for i, (e, lg) in enumerate(exprs)],
        "fieldConfig": {"defaults": {"unit": unit, "custom": {
            "lineWidth": 1, "fillOpacity": 10, "showPoints": "never",
            "stacking": {"mode": "normal" if stack else "none"}}}, "overrides": []},
        "options": {"legend": {"displayMode": "list", "placement": "bottom"},
                    "tooltip": {"mode": "multi"}},
    }
    if thresholds:
        p["fieldConfig"]["defaults"]["thresholds"] = {"mode": "absolute", "steps": thresholds}
        p["fieldConfig"]["defaults"]["custom"]["thresholdsStyle"] = {"mode": "line"}
    return p


def stat(title: str, expr: str, unit: str, steps: list, desc: str = "") -> dict:
    return {
        "type": "stat", "title": title, "id": _id(), "datasource": VM, "description": desc,
        "targets": [{"refId": "A", "datasource": VM, "expr": expr, "instant": True}],
        "fieldConfig": {"defaults": {"unit": unit, "decimals": 1,
                                     "thresholds": {"mode": "absolute", "steps": steps}},
                        "overrides": []},
        "options": {"colorMode": "background", "graphMode": "none", "reduceOptions": {
            "calcs": ["lastNotNull"], "fields": "", "values": False}, "textMode": "value"},
    }


GREEN = {"color": "green", "value": None}

row("Is it up and fast? (API, via Caddy)")
place([
    (stat("Requests / min", f"sum(rate(http_server_request_duration_seconds_count{{{API}}}[5m])) * 60",
          "short", [GREEN]), 4),
    (stat("5xx share (15 min)",
          f'sum(rate(http_server_request_duration_seconds_count{{{API},http_response_status_code=~"5.."}}[15m]))'
          f" / sum(rate(http_server_request_duration_seconds_count{{{API}}}[15m])) or vector(0)",
          "percentunit", [GREEN, {"color": "orange", "value": 0.01}, {"color": "red", "value": 0.05}]), 4),
    (stat("p95 latency (15 min)",
          f"histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket{{{API}}}[15m])))",
          "s", [GREEN, {"color": "orange", "value": 0.5}, {"color": "red", "value": 1.5}]), 4),
    (stat("Oldest waiting extraction", 'max(veridoc_jobs_oldest_age_seconds{status="queued"}) or vector(0)',
          "s", [GREEN, {"color": "orange", "value": 120}, {"color": "red", "value": 600}],
          "Seconds the oldest due job has waited. Over 10 minutes means the worker is stuck or out of quota."), 4),
    (stat("Memory used", 'max(system_memory_utilization_ratio{state="used"})', "percentunit",
          [GREEN, {"color": "orange", "value": 0.8}, {"color": "red", "value": 0.9}]), 4),
    (stat("Disk used", 'max(system_filesystem_utilization_ratio)', "percentunit",
          [GREEN, {"color": "orange", "value": 0.7}, {"color": "red", "value": 0.85}]), 4),
], h=4)
place([
    (ts("Requests by status", [(f"sum by (http_response_status_code) (rate(http_server_request_duration_seconds_count{{{API}}}[5m]))",
                                "{{http_response_status_code}}")], "reqps", stack=True), 8),
    (ts("p95 latency by route", [(f"histogram_quantile(0.95, sum by (le, http_route) (rate(http_server_request_duration_seconds_bucket{{{API}}}[5m])))",
                                  "{{http_route}}")], "s"), 8),
    (ts("Slowest routes, mean (1 h)", [(f"topk(5, sum by (http_route) (rate(http_server_request_duration_seconds_sum{{{API}}}[1h])) / sum by (http_route) (rate(http_server_request_duration_seconds_count{{{API}}}[1h])))",
                                        "{{http_route}}")], "s"), 8),
])

row("Extraction (worker → Gemini)")
place([
    (ts("Job queue", [("max by (status) (veridoc_jobs_count)", "{{status}}")], "short"), 6),
    (ts("Gemini calls by outcome (per 15 min)",
        [("sum by (outcome) (increase(veridoc_gemini_calls_total[15m]))", "{{outcome}}")], "short", stack=True,
        desc="ok, quota (429), overloaded (503/504/404, falls back to the next model), network, bad_schema, bad_status."), 6),
    (ts("Gemini p95 time by model", [("histogram_quantile(0.95, sum by (le, model) (rate(veridoc_gemini_duration_seconds_bucket[15m])))",
                                      "{{model}}")], "s"), 6),
    (ts("Extraction results (per 15 min)", [("sum by (outcome) (increase(veridoc_extractions_total[15m]))", "{{outcome}}")],
        "short", stack=True), 6),
])
place([
    (ts("Gemini calls in the last 24 h, per model",
        [("sum by (model) (increase(veridoc_gemini_calls_total[24h]))", "{{model}}")], "short",
        desc="The free tier allows about 20 requests per model per day.",
        thresholds=[GREEN, {"color": "red", "value": 20}]), 12),
    (ts("Fields below the 0.85 review threshold (share, 24 h)",
        [('sum by (doc_type) (increase(veridoc_field_confidence_bucket{le="0.85"}[24h])) / sum by (doc_type) (increase(veridoc_field_confidence_count[24h]))',
          "{{doc_type}}")], "percentunit",
        desc="Share of extracted fields a person has to review. Rising means the model or the documents got worse."), 12),
])

row("Server and containers")
place([
    (ts("CPU busy", [('1 - avg(system_cpu_utilization_ratio{state="idle"})', "cpu")], "percentunit"), 6),
    (ts("Memory and swap", [('sum(system_memory_usage_bytes{state="used"})', "RAM used"),
                            ('sum(system_paging_usage_bytes{state="used"})', "swap used")], "bytes"), 6),
    (ts("Memory by container", [("max by (container_name) (container_memory_usage_total_bytes)", "{{container_name}}")],
        "bytes"), 12),
])
place([
    (ts("Postgres connections", [("sum(postgresql_backends)", "backends")], "short"), 8),
    (ts("Postgres commits / rollbacks", [("sum(rate(postgresql_commits_total[5m]))", "commits"),
                                         ("sum(rate(postgresql_rollbacks_total[5m]))", "rollbacks")], "ops"), 8),
    (ts("Database size", [("sum(postgresql_db_size_bytes)", "crosscheck")], "bytes"), 8),
])

row("Logs")
place([({
    "type": "logs", "title": "Warnings and errors, all services", "id": _id(), "datasource": VL,
    "targets": [{"refId": "A", "datasource": VL, "queryType": "instant", "maxLines": 200,
                 "expr": "level:(error OR warn OR warning OR ERROR OR WARN) OR severity_text:(ERROR OR WARN)"}],
    "options": {"showTime": True, "wrapLogMessage": True, "sortOrder": "Descending",
                "enableLogDetails": True, "dedupStrategy": "none"},
}, 24)], h=10)

dashboard = {
    "uid": "veridoc-overview", "title": "Veridoc overview", "tags": ["veridoc"],
    "timezone": "browser", "schemaVersion": 41, "version": 1, "editable": False,
    "refresh": "1m", "time": {"from": "now-6h", "to": "now"}, "panels": panels,
    "description": "API health, extraction pipeline, server and logs. Provisioned from git.",
}
json.dump(dashboard, sys.stdout, indent=1)
print()
