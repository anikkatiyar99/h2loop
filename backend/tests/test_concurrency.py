"""Concurrency and thread-safety tests for JobStore."""
from __future__ import annotations

import threading
import time

import pytest

from app.schemas import JobStatus
from app.services.job_store import JobStore


def test_concurrent_job_creation_stays_within_limit() -> None:
    """Multiple threads creating jobs simultaneously must never exceed max_jobs."""
    max_jobs = 10
    store = JobStore(max_jobs=max_jobs)
    errors: list[Exception] = []
    created: list[str] = []
    lock = threading.Lock()

    def create_one() -> None:
        try:
            job = store.create("int f(){}")
            with lock:
                created.append(job.job_id)
        except OverflowError:
            pass
        except Exception as exc:
            with lock:
                errors.append(exc)

    threads = [threading.Thread(target=create_one) for _ in range(max_jobs * 2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"Unexpected errors: {errors}"
    assert store.job_count() <= max_jobs


def test_eviction_removes_completed_job() -> None:
    """When at capacity, creating a new job evicts the oldest completed job."""
    store = JobStore(max_jobs=2)
    j1 = store.create("int f(){}")
    j2 = store.create("int g(){}")
    # Mark j1 as completed
    store.update(j1.job_id, status=JobStatus.SUCCESS)
    # Creating a third job should evict j1
    j3 = store.create("int h(){}")
    assert store.get(j1.job_id) is None, "Oldest completed job should be evicted"
    assert store.get(j2.job_id) is not None
    assert store.get(j3.job_id) is not None


def test_overflow_error_when_no_completed_jobs() -> None:
    """OverflowError raised when at capacity with no completed jobs to evict."""
    store = JobStore(max_jobs=2)
    store.create("int f(){}")
    store.create("int g(){}")
    with pytest.raises(OverflowError):
        store.create("int h(){}")


def test_update_rejects_invalid_field() -> None:
    """update() raises ValueError for fields not in the allowlist."""
    store = JobStore()
    job = store.create("int f(){}")
    with pytest.raises(ValueError, match="not updatable"):
        store.update(job.job_id, source_code="hacked")


def test_update_ignores_missing_job() -> None:
    """update() silently ignores a non-existent job_id."""
    store = JobStore()
    # Should not raise
    store.update("nonexistent-id", status=JobStatus.SUCCESS)


def test_subscribe_returns_buffered_events() -> None:
    """subscribe() returns a copy of the event buffer at call time."""
    store = JobStore()
    job = store.create("int f(){}")
    store.emit(job.job_id, {"type": "job_started", "total_functions": 1})
    _, buffered = store.subscribe(job.job_id)
    assert len(buffered) == 1
    assert buffered[0]["type"] == "job_started"


def test_concurrent_emit_and_subscribe() -> None:
    """Emitting events from multiple threads must not corrupt the buffer."""
    store = JobStore()
    job = store.create("int f(){}")
    n_events = 50
    errors: list[Exception] = []

    def emit_events() -> None:
        for i in range(n_events):
            try:
                store.emit(job.job_id, {"type": "function_done", "i": i})
            except Exception as exc:
                errors.append(exc)

    threads = [threading.Thread(target=emit_events) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    j = store.get(job.job_id)
    assert j is not None
    assert len(j.event_buffer) == n_events * 4
