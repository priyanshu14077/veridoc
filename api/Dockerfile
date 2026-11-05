# API and extraction worker (same image, different command). Build context: the repo root,
# because the seed replays the synthetic documents in sample-docs/.
FROM python:3.12-slim

RUN pip install --no-cache-dir uv==0.11.23
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    STORAGE_DIR=/data/storage

WORKDIR /srv/api
COPY api/pyproject.toml api/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY api/app ./app
COPY api/migrations ./migrations
COPY sample-docs /srv/sample-docs

RUN useradd --system --uid 10001 app && mkdir -p /data/storage && chown app /data/storage
USER app
EXPOSE 8000

# Migrations and the seed are idempotent, so every start brings the database up to date.
CMD ["sh", "-c", "python -m app.migrate && python -m app.seed && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
