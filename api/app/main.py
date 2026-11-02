from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.auth.router import router as auth_router
from app.config import get_settings
from app.db import engine

app = FastAPI(title="Crosscheck API", docs_url="/api/docs", openapi_url="/api/openapi.json")

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


for r in (auth_router,):
    app.include_router(r, prefix="/api")
