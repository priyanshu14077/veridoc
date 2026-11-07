"""Markdown report from the local monitoring stack. Usage: run.sh report [window], e.g. 1h, 30m, 1d.

Reads VictoriaMetrics (PromQL, localhost:8428) and Grafana (alert states and trace services,
localhost:3001). Standard library only, so it runs with any python3.
"""

import base64
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime

VM = "http://localhost:8428/api/v1/query"
GRAFANA = "http://localhost:3001/api/"
API = 'service_name="veridoc-api"'
MONITORING = ("otel-collector", "victoriametrics", "victorialogs", "victoriatraces", "grafana")


def query(expr: str) -> list[tuple[dict, float]]:
    url = VM + "?" + urllib.parse.urlencode({"query": expr})
    with urllib.request.urlopen(url, timeout=10) as r:
        data = json.load(r)["data"]["result"]
    return [(row["metric"], float(row["value"][1])) for row in data]


def one(expr: str) -> float | None:
    rows = query(expr)
    return rows[0][1] if rows else None


def grafana(path: str):
    req = urllib.request.Request(GRAFANA + path)
    pw = os.environ.get("GRAFANA_ADMIN_PASSWORD", "admin")
    req.add_header("Authorization", "Basic " + base64.b64encode(f"admin:{pw}".encode()).decode())
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


def mb(v: float | None) -> str:
    return "–" if v is None else f"{v / 2**20:,.0f} MB"


def ms(v: float | None) -> str:
    return "–" if v is None or v != v else f"{v * 1000:,.0f} ms"


def core(v: float | None) -> str:
    # docker_stats reports CPU like `docker stats`: percent of one core.
    return "–" if v is None else f"{v:.1f}%"


def pct(v: float | None) -> str:
    return "–" if v is None or v != v else f"{v:.1%}"


def table(head: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return "_No data in this window._\n"
    lines = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    lines += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(lines) + "\n"


def by(label: str, rows: list[tuple[dict, float]]) -> dict[str, float]:
    return {m.get(label, "?"): v for m, v in rows}


def report(w: str) -> str:
    out = ["# Veridoc monitoring report\n\n",
           f"Generated {datetime.now().astimezone():%Y-%m-%d %H:%M %Z} from the local monitoring stack, "
           f"covering the last **{w}**.\n\n"]

    # ── API ──
    total = one(f"sum(increase(http_server_request_duration_seconds_count{{{API}}}[{w}]))")
    errors = one(f'sum(increase(http_server_request_duration_seconds_count{{{API},http_response_status_code=~"5.."}}[{w}]))') or 0
    p95 = one(f"histogram_quantile(0.95, sum by (le) (increase(http_server_request_duration_seconds_bucket{{{API}}}[{w}])))")
    out.append("## API\n\n")
    out.append(table(["Requests", "5xx", "5xx share", "p95 latency"],
                     [[f"{total or 0:,.0f}", f"{errors:,.0f}", pct(errors / total if total else None), ms(p95)]]))
    status = by("http_response_status_code", query(
        f"sum by (http_response_status_code) (increase(http_server_request_duration_seconds_count{{{API}}}[{w}]))"))
    out.append("\n**By status:** " + ", ".join(f"`{k}` {v:,.0f}" for k, v in sorted(status.items())) + "\n" if status else "")
    count = by("http_route", query(f"sum by (http_route) (increase(http_server_request_duration_seconds_count{{{API}}}[{w}]))"))
    mean = by("http_route", query(
        f"sum by (http_route) (increase(http_server_request_duration_seconds_sum{{{API}}}[{w}]))"
        f" / sum by (http_route) (increase(http_server_request_duration_seconds_count{{{API}}}[{w}]))"))
    p95r = by("http_route", query(
        f"histogram_quantile(0.95, sum by (le, http_route) (increase(http_server_request_duration_seconds_bucket{{{API}}}[{w}])))"))
    rows = [[f"`{r}`", f"{n:,.0f}", ms(mean.get(r)), ms(p95r.get(r))]
            for r, n in sorted(count.items(), key=lambda kv: -kv[1]) if n >= 1]
    out.append("\n### Routes\n\n")
    out.append(table(["Route", "Requests", "Mean", "p95"], rows))
    out.append("\np95 comes from histogram buckets, so it is an estimate within the bucket's range.\n")

    # ── Extraction ──
    out.append("\n## Extraction\n\n")
    calls = query(f"sum by (model, outcome) (increase(veridoc_gemini_calls_total[{w}]))")
    out.append("**Gemini calls by model and outcome**\n\n")
    out.append(table(["Model", "Outcome", "Calls"],
                     [[m.get("model", "?"), m.get("outcome", "?"), f"{v:,.0f}"] for m, v in sorted(calls, key=lambda x: (x[0].get("model", ""), -x[1])) if v >= 0.5]))
    ext = query(f"sum by (doc_type, outcome) (increase(veridoc_extractions_total[{w}]))")
    out.append("\n**Extraction results**\n\n")
    out.append(table(["Document type", "Outcome", "Jobs"],
                     [[m.get("doc_type", "?"), m.get("outcome", "?"), f"{v:,.0f}"] for m, v in ext if v >= 0.5]))
    low = one(f'sum(increase(veridoc_field_confidence_bucket{{le="0.85"}}[{w}])) / sum(increase(veridoc_field_confidence_count[{w}]))')
    oldest = one(f'max(max_over_time(veridoc_jobs_oldest_age_seconds{{status="queued"}}[{w}]))')
    out.append(f"\n- Fields below the 0.85 review threshold: **{pct(low)}**\n")
    out.append(f"- Longest any due job waited for the worker: **{'–' if oldest is None else f'{oldest:,.0f} s'}**\n")

    # ── Resource cost ──
    out.append("\n## Resource cost\n\n")
    avg = by("container_name", query(f"max by (container_name) (avg_over_time(container_memory_usage_total_bytes[{w}]))"))
    peak = by("container_name", query(f"max by (container_name) (max_over_time(container_memory_usage_total_bytes[{w}]))"))
    cpu = by("container_name", query(f"max by (container_name) (avg_over_time(container_cpu_utilization_ratio[{w}]))"))
    avg = {n: v for n, v in avg.items() if n.startswith("crosscheck-")}  # this compose project only
    rows, sums = [], {"app": [0.0, 0.0], "monitoring": [0.0, 0.0]}
    for name in sorted(avg, key=lambda n: (any(m in n for m in MONITORING), -avg[n])):
        group = "monitoring" if any(m in name for m in MONITORING) else "app"
        sums[group][0] += avg[name]
        sums[group][1] += peak.get(name, 0)
        short = name.removeprefix("crosscheck-").removesuffix("-1")
        rows.append([short, group, mb(avg[name]), mb(peak.get(name)), core(cpu.get(name))])
    out.append(table(["Container", "Part of", "Memory (mean)", "Memory (peak)", "CPU (mean, % of a core)"], rows))
    out.append("\n" + table(["", "Memory (mean)", "Memory (peak)"],
                            [["**App (production)**", mb(sums["app"][0]), mb(sums["app"][1])],
                             ["**Monitoring (local only)**", mb(sums["monitoring"][0]), mb(sums["monitoring"][1])]]))
    if sums["app"][0]:
        out.append(f"\nMonitoring uses **{sums['monitoring'][0] / sums['app'][0]:.1f}×** the memory of the app it watches. "
                   "On the 2 GB production server that would leave little room for the app, which is why it runs here.\n")
    db = one("max(postgresql_db_size_bytes)")
    backends = one(f"max(max_over_time(postgresql_backends[{w}]))")
    out.append(f"\n- Database size: **{mb(db)}**, peak connections: **{'–' if backends is None else f'{backends:.0f}'}**\n")

    # ── Alerts and traces ──
    out.append("\n## Alerts\n\n")
    try:
        rules = [r for g in grafana("prometheus/grafana/api/v1/rules")["data"]["groups"] for r in g["rules"]]
        out.append(table(["Rule", "State", "Health"],
                         [[r["name"], r["state"], r["health"]] for r in rules]))
        services = grafana("datasources/proxy/uid/traces/api/services").get("data") or []
        out.append("\n## Traces\n\nServices sending spans: " + ", ".join(f"`{s}`" for s in services) + "\n")
    except OSError as e:
        out.append(f"_Grafana not reachable ({e}); start it with `run.sh up`._\n")
    return "".join(out)


if __name__ == "__main__":
    try:
        print(report(sys.argv[1] if len(sys.argv) > 1 else "1h"))
    except OSError as e:
        sys.exit(f"VictoriaMetrics not reachable on localhost:8428 ({e}). Start the stack: run.sh up")
