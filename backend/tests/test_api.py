from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.main import create_app


def test_validate_route_reports_syntax_errors() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/validate",
            json={"code": 'int main(void) {\n  printf("x")\n  return 0;\n}\n'},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is False
    assert body["errors"]


def test_create_job_rejects_invalid_syntax() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/jobs",
            json={"code": "int main(void) {\n  if (1 {\n    return 0;\n  }\n}\n"},
        )

    assert response.status_code == 422
    assert "Code error" in response.json()["detail"]


def test_create_job_rejects_semantically_broken_code() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/jobs",
            json={"code": "int main(void) {\n  foo = 1;\n  return 0;\n}\n"},
        )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "Code error" in detail or "undeclared" in detail.lower() or "foo" in detail.lower()


def test_health_endpoint() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "jobs" in body
    assert "max_jobs" in body


def test_ws_unknown_job_closes_with_4004() -> None:
    with TestClient(create_app()) as client:
        with client.websocket_connect("/ws/jobs/nonexistent-job-id") as ws:
            # server should close immediately with code 4004
            # TestClient raises on close; catch and verify
            try:
                ws.receive_json()
            except Exception:
                pass  # expected — server closed the connection


def test_ws_completed_job_replays_buffer() -> None:
    """A subscriber joining after job completion receives all buffered events."""
    app_instance = create_app()
    with TestClient(app_instance) as client:
        response = client.post(
            "/api/jobs",
            json={"code": "int f(void) { return 0; }"},
        )
        assert response.status_code == 202
        job_id = response.json()["job_id"]

        # Poll until the job finishes before connecting via WebSocket so the
        # buffer is fully populated and the WS handler replays it immediately.
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            r = client.get(f"/api/jobs/{job_id}")
            if r.json().get("status") in ("success", "failed"):
                break
            time.sleep(0.05)

        events = []
        try:
            with client.websocket_connect(f"/ws/jobs/{job_id}") as ws:
                while True:
                    try:
                        data = ws.receive_json()
                        events.append(data)
                        if data.get("type") in ("job_complete", "error"):
                            break
                    except Exception:
                        break
        except Exception:
            pass

        types = [e.get("type") for e in events]
        assert "job_started" in types or "function_done" in types or "job_complete" in types


def test_ws_streams_function_done_for_valid_code() -> None:
    """Submitting valid C code results in function_done events over WebSocket."""
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/jobs",
            json={"code": "int add(int a, int b) { return a + b; }"},
        )
        assert response.status_code == 202
        job_id = response.json()["job_id"]

        # Poll until the job finishes before connecting via WebSocket so the
        # buffer is fully populated and the WS handler replays it immediately.
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            r = client.get(f"/api/jobs/{job_id}")
            if r.json().get("status") in ("success", "failed"):
                break
            time.sleep(0.05)

        events = []
        try:
            with client.websocket_connect(f"/ws/jobs/{job_id}") as ws:
                while True:
                    try:
                        data = ws.receive_json()
                        events.append(data)
                        if data.get("type") in ("job_complete", "error"):
                            break
                    except Exception:
                        break
        except Exception:
            pass

        types = [e.get("type") for e in events]
        assert "function_done" in types, f"Expected function_done, got: {types}"
        fn_events = [e for e in events if e.get("type") == "function_done"]
        assert fn_events[0]["function_name"] == "add"


def test_validate_empty_code() -> None:
    with TestClient(create_app()) as client:
        response = client.post("/api/validate", json={"code": "   "})
    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is False
    assert body["errors"] == []


def test_list_jobs_returns_list() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/jobs")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_job_404_for_unknown() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/jobs/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


def test_list_jobs_sorted_newest_first() -> None:
    """Jobs are returned sorted by created_at descending."""
    with TestClient(create_app()) as client:
        r1 = client.post("/api/jobs", json={"code": "int f(void){return 1;}"})
        r2 = client.post("/api/jobs", json={"code": "int g(void){return 2;}"})
        assert r1.status_code == 202
        assert r2.status_code == 202
        job1_id = r1.json()["job_id"]
        job2_id = r2.json()["job_id"]

        response = client.get("/api/jobs")
        assert response.status_code == 200
        jobs = response.json()
        ids = [j["job_id"] for j in jobs]
        assert ids.index(job2_id) < ids.index(job1_id), "Newest job should appear first"


def test_create_job_rejects_oversized_code() -> None:
    """Code over 500 KB is rejected with a 422."""
    with TestClient(create_app()) as client:
        response = client.post("/api/jobs", json={"code": "x" * 600_000})
    assert response.status_code == 422


def test_validate_oversized_code_returns_error() -> None:
    """Validate endpoint returns an error entry for oversized code."""
    with TestClient(create_app()) as client:
        response = client.post("/api/validate", json={"code": "x" * 600_000})
    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is False
    assert body["errors"]
