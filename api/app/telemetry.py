"""Logs, traces and metrics.

Logs always go to stdout as one JSON object per line, with the current trace id, so a log line
can be matched to its trace. Traces and metrics go over OTLP to the collector only when
OTEL_EXPORTER_OTLP_ENDPOINT is set (deploy/compose.yml sets it). Without it, as in development
and tests, the instruments below are no-ops and nothing leaves the process.
"""

import json
import logging
import os
import sys
from collections.abc import Callable, Iterable
from datetime import UTC, datetime
from typing import Any

from opentelemetry import metrics, propagate, trace
from opentelemetry.metrics import CallbackOptions, Observation

_meter = metrics.get_meter("veridoc")
tracer = trace.get_tracer("veridoc")

# Instruments are created up front; the SDK picks them up once setup() installs a provider.
gemini_calls = _meter.create_counter(
    "veridoc.gemini.calls", description="Gemini requests by model and outcome"
)
gemini_duration = _meter.create_histogram(
    "veridoc.gemini.duration",
    unit="s",
    description="Gemini request time",
    explicit_bucket_boundaries_advisory=[1, 2.5, 5, 10, 20, 30, 45, 60, 90],
)
extractions = _meter.create_counter(
    "veridoc.extractions", description="Finished extraction attempts by document type and outcome"
)
field_confidence = _meter.create_histogram(
    "veridoc.field.confidence",
    description="Final confidence of each extracted field",
    explicit_bucket_boundaries_advisory=[0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.99],
)

_EXCLUDED_URLS = "api/health"  # polled every 10 s by Docker; would drown the real traffic


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        ctx = trace.get_current_span().get_span_context()
        if ctx.is_valid:
            out["trace_id"] = format(ctx.trace_id, "032x")
            out["span_id"] = format(ctx.span_id, "016x")
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, ensure_ascii=False)


def _setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)
    # Uvicorn installs its own handlers before importing the app; route them through ours.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True
    # Caddy already logs every request (with status and duration); don't log each one twice.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def setup(service: str) -> bool:
    """Set up logging, plus OTLP export when a collector is configured (returns True then)."""
    _setup_logging()
    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return False

    from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    resource = Resource.create(
        {
            "service.name": service,
            "deployment.environment.name": os.environ.get("DEPLOY_ENV", "production"),
        }
    )
    tp = TracerProvider(resource=resource)
    tp.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(tp)
    reader = PeriodicExportingMetricReader(OTLPMetricExporter(), export_interval_millis=15_000)
    metrics.set_meter_provider(MeterProvider(resource=resource, metric_readers=[reader]))

    # At the driver, not SQLAlchemy: the SQLAlchemy instrumentor doesn't support 2.1 yet.
    PsycopgInstrumentor().instrument()
    HTTPXClientInstrumentor().instrument()  # the Gemini SDK talks HTTP through httpx
    return True


def instrument_app(app: Any) -> None:
    if os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        # exclude_spans drops the per-chunk ASGI send/receive spans: noise, not information.
        FastAPIInstrumentor.instrument_app(
            app, excluded_urls=_EXCLUDED_URLS, exclude_spans=["receive", "send"]
        )


def observe_gauges(
    name: str, description: str, read: Callable[[], Iterable[Observation]], unit: str = ""
) -> None:
    def callback(_: CallbackOptions) -> Iterable[Observation]:
        try:
            return list(read())
        except Exception:  # a failed scrape must never take the worker down
            logging.getLogger("veridoc.telemetry").exception("gauge %s failed", name)
            return []

    _meter.create_observable_gauge(name, callbacks=[callback], description=description, unit=unit)


def inject_context() -> dict[str, str]:
    """The current trace context, to store with a queued job so the worker continues the trace."""
    carrier: dict[str, str] = {}
    propagate.inject(carrier)
    return carrier


def extract_context(carrier: dict[str, str] | None) -> Any:
    return propagate.extract(carrier or {})
