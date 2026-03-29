from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import build_router
from app.config import get_settings
from app.services import JobStore


_LOG_RECORD_BUILTINS = frozenset(
    vars(logging.LogRecord("", 0, "", 0, "", (), None)).keys()
    | {"message", "asctime"}
)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        obj: dict = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            obj["exc"] = self.formatException(record.exc_info)
        # Include only fields injected via extra={} — not built-in LogRecord attrs
        for key, val in record.__dict__.items():
            if key not in _LOG_RECORD_BUILTINS and not key.startswith("_"):
                obj[key] = val
        return json.dumps(obj)


def _setup_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


def create_app() -> FastAPI:
    settings = get_settings()
    store = JobStore(max_jobs=settings.max_jobs)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        _setup_logging()
        store.set_loop(asyncio.get_running_loop())
        yield

    app = FastAPI(
        title="c-analyser",
        summary="C control-flow visualizer — AST traversal to Mermaid diagrams",
        description="""
## c-analyser API

Accepts C source code, validates it with **Clang**, traverses each function's AST with **ast-grep**,
and streams **Mermaid flowchart** diagrams with source-span mappings over WebSocket.

### Workflow

1. **Validate** — `POST /api/validate` for live syntax feedback while editing
2. **Submit** — `POST /api/jobs` to queue an analysis run
3. **Stream** — `WS /ws/jobs/{job_id}` to receive function diagrams as they are generated
4. **Inspect** — `GET /api/jobs/{job_id}` to retrieve completed results

### Diagram nodes

Each function produces a Mermaid `flowchart TD` with:
- **Stadium nodes** — function entry/exit
- **Rect nodes** — statements, declarations, expressions
- **Amber diamonds** (`if:`, `switch:`) — branching decisions
- **Cyan loop-diamonds** (`while:`, `for:`, `do-while:`) — loop conditions

Each node carries a `span_map` entry mapping node ID → `[start_line, end_line]` for source highlighting.
""",
        version="1.0.0",
        contact={"name": "c-analyser"},
        license_info={"name": "MIT"},
        openapi_tags=[
            {"name": "Jobs", "description": "Submit and monitor analysis jobs"},
            {"name": "Validation", "description": "Syntax validation without creating a job"},
            {"name": "System", "description": "Health and operational endpoints"},
        ],
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(build_router(store, settings))
    return app


app = create_app()
