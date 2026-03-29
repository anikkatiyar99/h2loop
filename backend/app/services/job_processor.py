from __future__ import annotations

import asyncio
import logging

from ast_grep_py import SgRoot

from app.schemas import FunctionResult, JobStatus
from app.services.job_store import JobStore
from app.traversal import CTraverser, _extract_name
from app.traversal.traverser import MAX_NODES

logger = logging.getLogger(__name__)


async def process_job(
    job_id: str,
    code: str,
    *,
    store: JobStore,
) -> None:
    loop = asyncio.get_running_loop()

    try:
        store.update(job_id, status=JobStatus.IN_PROGRESS)

        root = await loop.run_in_executor(None, SgRoot, code, "c")
        function_nodes = await loop.run_in_executor(
            None,
            lambda: root.root().find_all(kind="function_definition"),
        )
        total = len(function_nodes)
        store.update(job_id, total_functions=total)
        store.emit(job_id, {"type": "job_started", "total_functions": total})
        logger.info("job %s started: %d functions", job_id, total, extra={"job_id": job_id, "total_functions": total})

        if total == 0:
            store.update(job_id, status=JobStatus.SUCCESS)
            store.emit(
                job_id,
                {"type": "job_complete", "status": "success", "total_functions": 0},
            )
            return

        traverser = CTraverser()
        results: list[FunctionResult] = []

        for index, function_node in enumerate(function_nodes):
            name = _extract_name(function_node)
            logger.debug("job %s: traversing %s (%d/%d)", job_id, name, index + 1, total, extra={"job_id": job_id, "function": name})

            try:
                mermaid, span_map, count = await asyncio.wait_for(
                    loop.run_in_executor(None, traverser.traverse_function, function_node),
                    timeout=30.0,
                )
            except asyncio.TimeoutError:
                logger.warning("job %s: function %s timed out", job_id, name, extra={"job_id": job_id, "function": name})
                mermaid, span_map, count = "", {}, MAX_NODES + 1

            too_large = count > MAX_NODES

            result = FunctionResult(
                name=name,
                mermaid=mermaid,
                span_map=span_map,
                too_large=too_large,
            )
            results.append(result)
            processed = index + 1
            store.update(job_id, processed_functions=processed)
            store.emit(
                job_id,
                {
                    "type": "function_done",
                    "function_name": name,
                    "mermaid": mermaid,
                    "span_map": span_map,
                    "too_large": too_large,
                    "processed": processed,
                    "total": total,
                },
            )

        store.update(job_id, status=JobStatus.SUCCESS, results=results)
        store.emit(job_id, {"type": "job_complete", "status": "success"})
        logger.info("job %s complete (%d functions)", job_id, total, extra={"job_id": job_id, "total_functions": total})

    except Exception as exc:
        logger.exception("job %s failed: %s", job_id, exc, extra={"job_id": job_id})
        store.update(job_id, status=JobStatus.FAILED, error=str(exc))
        store.emit(job_id, {"type": "error", "message": str(exc)})
