# Crosscheck

AI document extraction and cross-checks for a customs broker's import shipments. Executives drop in a
shipment's invoice, packing list and bill of lading; a vision model extracts the fields with confidence
scores; deterministic rules check the three documents against each other; nothing exports until a
person has cleared every uncertain or conflicting value.

- Product requirements: [docs/PRD.md](docs/PRD.md)
- Technical design: [docs/TDD.md](docs/TDD.md)

## Run locally

Needs Docker, [uv](https://docs.astral.sh/uv/) and Node 24.

```bash
docker compose up -d db                     # Postgres on localhost:5433

cd api
cp .env.example .env
uv sync
uv run python -m app.migrate                # apply SQL migrations
uv run python -m app.seed                   # demo users + 12 shipments
uv run uvicorn app.main:app --port 8000

cd ../web                                   # in a second terminal
cp .env.example .env.local
npm install
npm run dev                                 # http://localhost:3000
```

Demo sign-in (fictional people, password `crosscheck-demo`):

| Role | Email |
|---|---|
| Executive | `meera.exec@crosscheck.demo` |
| Executive | `rohan.exec@crosscheck.demo` |
| Manager | `anil.manager@crosscheck.demo` |

## Tests

```bash
cd api && uv run pytest     # uses the crosscheck_test database created by docker compose
```
