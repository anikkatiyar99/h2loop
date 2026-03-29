from __future__ import annotations

import asyncio

from fastapi import APIRouter, BackgroundTasks, HTTPException, WebSocket, WebSocketDisconnect

from app.config import Settings
from app.schemas import (
    CreateJobRequest,
    CreateJobResponse,
    Job,
    JobListItem,
    JobStatus,
    ValidationError as SchemaValidationError,
    ValidationRequest,
    ValidationResponse,
)
from app.services import JobStore, format_syntax_error, process_job, validate_c_code


def build_router(store: JobStore, settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/api/jobs",
        status_code=202,
        response_model=CreateJobResponse,
        tags=["Jobs"],
        summary="Submit a C source file for analysis",
        description=(
            "Validates the submitted C code with Clang, then enqueues an AST traversal job. "
            "Returns immediately with a job ID. Stream results via the WebSocket endpoint."
        ),
    )
    async def create_job(
        payload: CreateJobRequest, background_tasks: BackgroundTasks
    ) -> CreateJobResponse:
        code = payload.code

        if not code.strip():
            raise HTTPException(422, "code is required")
        if len(code.encode()) > settings.max_code_bytes:
            raise HTTPException(422, "Code exceeds 500 KB limit")

        loop = asyncio.get_running_loop()
        syntax_errors = await loop.run_in_executor(None, validate_c_code, code)
        if syntax_errors:
            raise HTTPException(422, format_syntax_error(syntax_errors[0]))

        try:
            job = store.create(code)
        except OverflowError as exc:
            raise HTTPException(429, "Server is at job capacity — try again later") from exc

        background_tasks.add_task(
            process_job,
            job.job_id,
            code,
            store=store,
        )
        return CreateJobResponse(job_id=job.job_id, status=job.status)

    @router.post(
        "/api/validate",
        response_model=ValidationResponse,
        tags=["Validation"],
        summary="Validate C source code syntax",
        description=(
            "Runs the submitted code through Clang and returns any syntax errors with precise "
            "line/column locations. Used by the editor for live feedback."
        ),
    )
    async def validate_code(payload: ValidationRequest) -> ValidationResponse:
        code = payload.code
        if not code.strip():
            return ValidationResponse(valid=False, errors=[])
        if len(code.encode()) > settings.max_code_bytes:
            return ValidationResponse(
                valid=False,
                errors=[
                    SchemaValidationError(
                        message="Code exceeds 500 KB limit",
                        line=1,
                        column=1,
                        end_line=1,
                        end_column=2,
                        source="limit",
                    )
                ],
            )

        loop = asyncio.get_running_loop()
        errors = await loop.run_in_executor(None, validate_c_code, code)
        return ValidationResponse(valid=not errors, errors=errors)

    @router.get(
        "/api/jobs",
        response_model=list[JobListItem],
        tags=["Jobs"],
        summary="List all analysis jobs",
        description=(
            "Returns all jobs in the in-memory store, sorted newest-first. "
            "Includes status, progress counters, and a 80-character source snippet."
        ),
    )
    async def list_jobs() -> list[JobListItem]:
        jobs = sorted(store.list_all(), key=lambda j: j.created_at, reverse=True)
        return [
            JobListItem(
                job_id=job.job_id,
                status=job.status,
                total_functions=job.total_functions,
                processed_functions=job.processed_functions,
                error=job.error,
                created_at=job.created_at.isoformat(),
                snippet=job.source_code[:80].strip().replace("\n", " "),
            )
            for job in jobs
        ]

    @router.get(
        "/api/jobs/{job_id}",
        response_model=Job,
        tags=["Jobs"],
        summary="Get a job by ID",
        description=(
            "Returns the full job object including all function results, source code, "
            "and the raw Mermaid strings."
        ),
        responses={404: {"description": "Job not found"}},
    )
    async def get_job(job_id: str):
        job = store.get(job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        return job

    @router.get(
        "/api/health",
        tags=["System"],
        summary="Health check",
        response_model=dict,
    )
    async def health() -> dict:
        """Returns server health and current job store capacity."""
        return {
            "status": "ok",
            "jobs": store.job_count(),
            "max_jobs": settings.max_jobs,
        }

    @router.websocket("/ws/jobs/{job_id}")
    async def ws_job(ws: WebSocket, job_id: str) -> None:
        """
        Stream real-time analysis events for a job.

        Events (JSON, discriminated by `type`):
        - `job_started` — `{ type, total_functions }`
        - `function_done` — `{ type, function_name, mermaid, span_map, too_large, processed, total }`
        - `job_complete` — `{ type, status }`
        - `error` — `{ type, message }`

        Replays all buffered events on connect, so late subscribers receive the full history.
        Closes with code 4004 if the job ID is not found.
        """
        job = store.get(job_id)
        if not job:
            await ws.accept()
            await ws.close(code=4004)
            return

        await ws.accept()
        queue, buffered = store.subscribe(job_id)

        try:
            for event in buffered:
                await ws.send_json(event)

            current_job = store.get(job_id)
            if current_job and current_job.status in (JobStatus.SUCCESS, JobStatus.FAILED):
                return

            while True:
                event = await queue.get()
                await ws.send_json(event)
                if event.get("type") in ("job_complete", "error"):
                    break
        except WebSocketDisconnect:
            pass
        finally:
            store.unsubscribe(job_id, queue)

    return router
