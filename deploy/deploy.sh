#!/usr/bin/env bash
# Runs on the server, piped over SSH by the deploy job in .github/workflows/ci.yml.
# Usage: bash -s -- <commit-sha>
# Moves the checkout to the commit CI just tested, rebuilds what changed and waits until healthy.
set -euo pipefail

sha="${1:?commit sha required}"
cd "${APP_DIR:-$HOME/veridoc}"

git fetch --quiet origin master
# Fast-forward only: if someone edited tracked files on the server, stop instead of discarding them.
git merge --ff-only --quiet "$sha"
echo "checked out $(git log --oneline -1)"

# Veridoc rename: a server set up from the old .env.example still has the old demo password.
sed -i 's/^SEED_DEMO_PASSWORD=crosscheck-demo$/SEED_DEMO_PASSWORD=veridoc-demo/' deploy/.env

# Grafana's admin password is created on the server the first time and never leaves it.
if ! grep -q '^GRAFANA_ADMIN_PASSWORD=.' deploy/.env; then
  echo "GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 16)" >> deploy/.env
  echo "created GRAFANA_ADMIN_PASSWORD in deploy/.env"
fi
# Recreate the collector and Grafana when their mounted config changes (see deploy/compose.yml).
OBS_CONFIG_HASH=$(find deploy/observability -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16)
export OBS_CONFIG_HASH

compose=(docker compose -f deploy/compose.yml --env-file deploy/.env)
"${compose[@]}" up -d --build --wait --wait-timeout 300
"${compose[@]}" ps --format '{{.Name}}  {{.Status}}'

# Old image layers pile up on a 30 GB disk after a few deploys.
docker image prune -f >/dev/null
