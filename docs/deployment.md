# Deployment: Veridoc

**Live site:** https://16-179-13-144.sslip.io (landing page) · **Live app:** https://16-179-13-144.sslip.io/login · **Repository:** https://github.com/priyanshu14077/veridoc

Veridoc runs as five app containers on one Linux server: Postgres, the API, the extraction worker, the Next.js web app, and Caddy for HTTPS, which also serves the static landing page. Monitoring (OpenTelemetry, VictoriaMetrics/Logs/Traces and Grafana) is not deployed: it runs on a developer's machine on top of the same compose file. [observability.md](observability.md) explains why and how. The live demo runs on one AWS EC2 server in Sydney (ap-southeast-2), because the AWS account used for it can't open other regions. It holds only fictional data. A real deployment uses the same steps in Mumbai (ap-south-1), so the database and the uploaded files stay in India (TDD assumption A32).

```
Internet ──443──► Caddy ──/api/*──────────────► api (FastAPI) ──► db (Postgres)
                    ├──/, /_landing/*, /media/*─► landing page (static files inside the Caddy image)
                    └──everything else─────────► web (Next.js)          ▲
                                                 worker (same image as api) ──► Gemini API
```

Only Caddy publishes ports (80 and 443). The database, API and web app are reachable only from the other containers.

### One address, landing page and app

The landing page (`landing/`) and the app share the address, so the session cookie stays first-party and nothing needs CORS.

| Path | Served by | Cache-Control |
|---|---|---|
| `/` (and `/icon.svg`) | landing page | `no-cache`: revalidated on every visit, so a deploy shows at once |
| `/_landing/*` | landing page's JS, CSS and fonts (content-hashed names) | `public, max-age=31536000, immutable` |
| `/media/*` | landing page's background photos and video | `public, max-age=604800` (a week, then ETag) |
| `/api/*` | API | set by the API |
| everything else: `/login`, `/shipments`, `/_next/*` … | web app | set by Next.js |

Both are Next.js builds and both would put their files under `/_next/`. The landing page is built with `LANDING_ASSET_PREFIX=/_landing`, and Caddy strips the prefix again (`handle_path`). Its links to the demo are same-site (`/login`) because the build sets `NEXT_PUBLIC_APP_URL=""`.

The Caddy image is built by `landing/Dockerfile`: Node builds the static site, then only `out/` is copied onto `caddy:2.10-alpine`. `landing/.dockerignore` keeps `node_modules`, earlier builds and the full-size art in `landing/design-assets/` out of the build context. `deploy/check-landing.sh` checks all of the above; CI runs it on the local stack and against the live site after every deploy.

## Demo accounts

All people and companies are fictional. The password for every account is `veridoc-demo`.

| Role | Email | Sees |
|---|---|---|
| Executive | `meera.exec@veridoc.demo` | Their own shipments and the unassigned pool |
| Executive | `rohan.exec@veridoc.demo` | Their own shipments and the unassigned pool |
| Manager | `anil.manager@veridoc.demo` | Every shipment, the overrides log and the accuracy report |

## 1. Run locally (development)

Prerequisites: Docker, [uv](https://docs.astral.sh/uv/), Node 24.

```bash
docker compose up -d db                       # Postgres on localhost:5433

cd api
cp .env.example .env                          # add GEMINI_API_KEY to read new uploads
uv sync
uv run python -m app.migrate
uv run python -m app.seed                     # demo users, 12 shipments, 35 documents
uv run uvicorn app.main:app --port 8000

cd api && uv run python -m app.worker         # second terminal: extraction worker

cd web && cp .env.example .env.local && npm install && npm run dev   # http://localhost:3000
```

The seeded shipments replay recorded Gemini output, so the demo works without a Gemini key. Only a new upload needs one.

## 2. Run the production stack locally

This is the same stack the server runs. Caddy issues a local certificate for `localhost`.

```bash
cp deploy/.env.example deploy/.env            # set SITE_ADDRESS=localhost and a POSTGRES_PASSWORD
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
open https://localhost                        # accept the local certificate warning
```

## 3. Deploy to AWS EC2

### 3.1 Create the server

1. In the AWS console, set the region (top right) *before* creating anything: **Asia Pacific (Mumbai) ap-south-1** for real use. A server can't be moved to another region later. (The live demo is in Sydney, ap-southeast-2, the only region its account allows.)
2. **EC2 → Launch instance**:
   - Image: **Ubuntu Server 24.04 LTS** (64-bit x86)
   - Name: `veridoc`
   - Type: **t3.small** (2 GB RAM). 1 GB isn't enough for Postgres, the API, the worker and Next.js together.
   - Key pair: create one and save the `.pem` file outside the repository (for example `~/.ssh/veridoc.pem`).
   - Network: allow **SSH from My IP**, **HTTP from anywhere** and **HTTPS from anywhere**.
   - Storage: 30 GB gp3.
3. **EC2 → Elastic IPs → Allocate**, then **Associate** it with the instance, so the address survives a restart.

### 3.2 Prepare the server

```bash
chmod 400 ~/.ssh/veridoc.pem
ssh -i ~/.ssh/veridoc.pem ubuntu@<elastic-ip>

sudo apt-get update && sudo apt-get -y upgrade
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# 2 GB of swap, so building the web image doesn't run out of memory
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
exit                                          # log in again so the docker group applies
```

### 3.3 Configure and start

```bash
ssh -i ~/.ssh/veridoc.pem ubuntu@<elastic-ip>
git clone https://github.com/priyanshu14077/veridoc.git && cd veridoc
cp deploy/.env.example deploy/.env
nano deploy/.env
```

In `deploy/.env`:
- `SITE_ADDRESS`: the address people will open. Without a domain, use the Elastic IP through sslip.io, with dashes instead of dots: IP `13.233.10.20` becomes `13-233-10-20.sslip.io`.
- `POSTGRES_PASSWORD`: the output of `openssl rand -hex 24`.
- `GEMINI_API_KEY`: the Gemini key (free tier, synthetic documents only).

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
docker compose -f deploy/compose.yml --env-file deploy/.env ps      # all running; api "healthy"
```

The first build takes several minutes. On every start, the API applies the SQL migrations and runs the seed. Both are safe to repeat. Caddy gets a Let's Encrypt certificate for `SITE_ADDRESS` the first time it's opened over HTTPS.

### 3.4 Check it

```bash
curl -s https://<site-address>/api/health                         # {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" https://<site-address>/api/reports/accuracy   # 401
deploy/check-landing.sh https://<site-address>   # landing page at /, app at /login, caching
```

Then run the demo script from PRD §14 in a browser.

### 3.5 Update, logs, backup

```bash
cd ~/veridoc && git pull
# One image at a time (two Next.js builds at once can exhaust 2 GB), then start.
for s in api web caddy; do docker compose -f deploy/compose.yml --env-file deploy/.env build "$s"; done
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --wait
docker compose -f deploy/compose.yml --env-file deploy/.env logs -f api worker
docker compose -f deploy/compose.yml --env-file deploy/.env exec db \
  pg_dump -U crosscheck crosscheck > backup-$(date +%F).sql
```

Data lives in Docker volumes (`pgdata`, `storage`) and survives restarts and rebuilds. `docker compose down -v` deletes it.

### 3.6 Automatic deploys from CI

After the `api`, `web` and `stack` jobs pass on a push to `master`, the `deploy` job in `.github/workflows/ci.yml` connects to the server over SSH and runs `deploy/deploy.sh`. The script fast-forwards the checkout to the tested commit, rebuilds and restarts the containers, and waits for them to become healthy. The job then smoke-tests the live site. Pull requests never deploy.

One-time setup:

1. **Security group:** GitHub's runners use many different IP addresses, so the SSH rule has to allow port 22 from `0.0.0.0/0`. Login is by key only (Ubuntu turns off password login by default).
2. **Repository secrets** (*Settings → Secrets and variables → Actions*):
   - `EC2_HOST`: the Elastic IP.
   - `EC2_SSH_KEY`: the whole `.pem` file.
   - `EC2_KNOWN_HOSTS`: the output of `ssh-keyscan -t ed25519 <elastic-ip>`, so the job refuses an unknown server.
3. **Repository variable** `SITE_ADDRESS`, for example `16-179-13-144.sslip.io`. The deploy job stays off until this is set.

The deploy job only fast-forwards. If someone has edited tracked files on the server, it stops rather than overwrite them.

## 4. Environment variables

Names only. Real values live in `api/.env` (development) or `deploy/.env` (server). Both are git-ignored.

| Variable | Used by | Purpose |
|---|---|---|
| `SITE_ADDRESS` | deploy | Public host name that Caddy serves and gets a certificate for |
| `POSTGRES_PASSWORD` | deploy | Database password (hex, so it's safe inside the connection string) |
| `DATABASE_URL` | api, worker | Postgres connection string (set by `deploy/compose.yml` on the server) |
| `COOKIE_SECURE` | api | `true` behind HTTPS (set by the compose file) |
| `ALLOWED_ORIGINS` | api | JSON list of origins allowed to make state-changing requests (set from `SITE_ADDRESS`) |
| `TRUST_PROXY` | api | Read the client IP from `X-Forwarded-For` set by Caddy or the web proxy |
| `SESSION_TTL_HOURS` | api | Idle session lifetime (default 12) |
| `SEED_DEMO_PASSWORD` | api | Password for the seeded demo users |
| `GEMINI_API_KEY` | worker | Gemini key (free tier, synthetic data only) |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | worker | Primary model and the models tried on 503/429 |
| `GEMINI_RPM` | worker | Calls per minute, kept under the free-tier limit |
| `CONFIDENCE_THRESHOLD` | api, worker | Fields below this are flagged (default 0.85) |
| `STORAGE_DIR`, `MAX_UPLOAD_MB` | api, worker | Where files are kept; upload size limit |
| `API_ORIGIN` | web | Where the web server forwards `/api/*` (build time) |

## 5. Limits of this deployment

- The live demo is in Sydney, not India (TDD A32). Production runs in Mumbai.
- One server, no replica. A backup is a manual `pg_dump` (above).
- Files are on the server's disk (a Docker volume), not S3. The storage interface takes an S3 driver without other changes.
- The Gemini free tier allows about 20 extractions per model per day. The seeded shipments don't use it. Production would move to Vertex AI in an Indian region (TDD §5.7).
