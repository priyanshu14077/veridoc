from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app import telemetry
from app.auth.router import router as auth_router
from app.checks.router import router as checks_router
from app.config import get_settings
from app.db import engine
from app.documents.router import router as documents_router
from app.export.router import router as export_router
from app.fields.router import router as fields_router
from app.parties import router as parties_router
from app.reports.router import router as reports_router
from app.shipments.router import router as shipments_router
from app.users import router as users_router

telemetry.setup("veridoc-api")
app = FastAPI(title="Veridoc API", docs_url="/api/docs", openapi_url="/api/openapi.json")

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def origin_check(request: Request, call_next):  # type: ignore[no-untyped-def]
    """CSRF defence on top of SameSite=Lax: reject state-changing requests from foreign origins."""
    origin = request.headers.get("origin")
    if request.method in UNSAFE and origin and origin not in get_settings().allowed_origins:
        return JSONResponse({"detail": "Cross-origin request blocked"}, status_code=403)
    return await call_next(request)


@app.get("/api/health")
def health() -> dict[str, str]:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}


for r in (
    auth_router,
    shipments_router,
    documents_router,
    fields_router,
    checks_router,
    export_router,
    parties_router,
    reports_router,
    users_router,
):
    app.include_router(r, prefix="/api")

telemetry.instrument_app(app)
