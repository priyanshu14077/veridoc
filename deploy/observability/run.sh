#!/usr/bin/env bash
# Local monitoring for Veridoc: the production stack plus the monitoring overlay, on this machine.
# Run from anywhere:
#   deploy/observability/run.sh up               build and start everything, wait until healthy
#   deploy/observability/run.sh traffic [N]      send N rounds of demo requests (default 50)
#   deploy/observability/run.sh report [window]  print a Markdown report for the last window (default 1h)
#   deploy/observability/run.sh down             stop everything (data volumes are kept)
#   deploy/observability/run.sh <any compose command>   e.g. ps, logs -f api
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
[ -f deploy/.env ] || { echo "deploy/.env is missing: copy deploy/.env.example and set SITE_ADDRESS=localhost and POSTGRES_PASSWORD" >&2; exit 1; }

# Recreate the collector and Grafana when their mounted config changes.
OBS_CONFIG_HASH=$(find deploy/observability -type f -print0 | LC_ALL=C sort -z | xargs -0 cat | shasum -a 256 | cut -c1-16)
export OBS_CONFIG_HASH
compose=(docker compose -f deploy/compose.yml -f deploy/compose.observability.yml --env-file deploy/.env)
site="https://$(grep '^SITE_ADDRESS=' deploy/.env | cut -d= -f2)"
grafana_pw="$(grep '^GRAFANA_ADMIN_PASSWORD=' deploy/.env | cut -d= -f2 || true)"

case "${1:-}" in
  up)
    "${compose[@]}" up -d --build --wait --wait-timeout 300
    "${compose[@]}" ps --format '{{.Name}}  {{.Status}}'
    echo
    echo "App:     $site  (demo: anil.manager@veridoc.demo / veridoc-demo)"
    if [ -n "$grafana_pw" ]; then pw_hint="GRAFANA_ADMIN_PASSWORD in deploy/.env"; else pw_hint="admin"; fi
    echo "Grafana: http://localhost:3001  (user admin, password: $pw_hint)"
    ;;
  traffic)
    rounds="${2:-50}"
    jar="$(mktemp)"; trap 'rm -f "$jar"' EXIT
    c() { curl -sk -o /dev/null -w '%{http_code}\n' -b "$jar" "$@"; }
    curl -sk -o /dev/null -c "$jar" -H "Origin: $site" -H 'Content-Type: application/json' \
      -d '{"email":"anil.manager@veridoc.demo","password":"veridoc-demo"}' "$site/api/auth/login"
    ids=$(curl -sk -b "$jar" "$site/api/shipments" | python3 -c 'import json,sys; print(" ".join(str(s["id"]) for s in json.load(sys.stdin)["items"]))')
    for _ in $(seq 1 "$rounds"); do
      c "$site/api/auth/me"; c "$site/api/shipments"; c "$site/api/importers"; c "$site/api/suppliers"
      c "$site/api/reports/accuracy"; c "$site/api/reports/overrides"; c "$site/login"
      for id in $ids; do c "$site/api/shipments/$id"; done
      c "$site/api/shipments/999999"  # 404
      curl -sk -o /dev/null -w '%{http_code}\n' "$site/api/reports/accuracy"  # 401, no cookie
    done | sort | uniq -c | awk '{print "  " $2 ": " $1 " requests"}'
    ;;
  report)
    GRAFANA_ADMIN_PASSWORD="${grafana_pw:-admin}" python3 deploy/observability/report.py "${2:-1h}"
    ;;
  down)
    "${compose[@]}" down
    ;;
  "")
    sed -n '2,9p' "$0"; exit 1
    ;;
  *)
    "${compose[@]}" "$@"
    ;;
esac
