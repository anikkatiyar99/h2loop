from __future__ import annotations

import asyncio
import threading
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from app.schemas import Job, JobStatus


_UPDATABLE_FIELDS = frozenset({
    "status", "total_functions", "processed_functions", "results", "error"
})


class JobStore:
    def __init__(self, max_jobs: int = 500) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._queues: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._max_jobs = max_jobs

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def _evict_oldest_completed(self) -> bool:
        """Evict the oldest COMPLETED (SUCCESS or FAILED) job. Must be called
        with self._lock held. Returns True if a job was evicted."""
        completed = [
            j for j in self._jobs.values()
            if j.status in (JobStatus.SUCCESS, JobStatus.FAILED)
        ]
        if not completed:
            return False
        oldest = min(completed, key=lambda j: j.created_at)
        del self._jobs[oldest.job_id]
        self._queues.pop(oldest.job_id, None)
        return True

    def create(self, source_code: str) -> Job:
        with self._lock:
            if len(self._jobs) >= self._max_jobs:
                if not self._evict_oldest_completed():
                    raise OverflowError("Job limit reached")
            job = Job(
                job_id=str(uuid.uuid4()),
                status=JobStatus.QUEUED,
                source_code=source_code,
                created_at=datetime.now(timezone.utc),
            )
            self._jobs[job.job_id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def list_all(self) -> list[Job]:
        with self._lock:
            return list(self._jobs.values())

    def update(self, job_id: str, **kwargs) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            for key, value in kwargs.items():
                if key not in _UPDATABLE_FIELDS:
                    raise ValueError(f"Field '{key}' is not updatable on Job")
                setattr(job, key, value)

    def emit(self, job_id: str, event: dict) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.event_buffer.append(event)
            queues = list(self._queues[job_id])

        if self._loop is None:
            return

        for queue in queues:
            asyncio.run_coroutine_threadsafe(queue.put(event), self._loop)

    def subscribe(self, job_id: str) -> tuple[asyncio.Queue, list[dict]]:
        queue: asyncio.Queue = asyncio.Queue()
        with self._lock:
            self._queues[job_id].append(queue)
            job = self._jobs.get(job_id)
            # Access event_buffer inside the lock so the job cannot be evicted
            # between the get() call and the attribute access.
            buffered = list(job.event_buffer) if job is not None else []
        return queue, buffered

    def unsubscribe(self, job_id: str, queue: asyncio.Queue) -> None:
        with self._lock:
            queues = self._queues.get(job_id)
            if queues and queue in queues:
                queues.remove(queue)

    def job_count(self) -> int:
        with self._lock:
            return len(self._jobs)
