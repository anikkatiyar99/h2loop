from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    SUCCESS = "success"
    FAILED = "failed"


class FunctionResult(BaseModel):
    name: str
    mermaid: str
    span_map: dict[str, list[int]]
    too_large: bool = False


class Job(BaseModel):
    job_id: str
    status: JobStatus
    source_code: str = ""
    total_functions: int = 0
    processed_functions: int = 0
    results: list[FunctionResult] = Field(default_factory=list)
    error: str | None = None
    event_buffer: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"arbitrary_types_allowed": True, "validate_assignment": True}


class CreateJobRequest(BaseModel):
    code: str = ""

    model_config = {
        "json_schema_extra": {
            "examples": [{"code": "int add(int a, int b) { return a + b; }"}]
        }
    }


class ValidationRequest(BaseModel):
    code: str = ""

    model_config = {
        "json_schema_extra": {
            "examples": [{"code": "int main(void) { return 0; }"}]
        }
    }


class ValidationError(BaseModel):
    message: str
    line: int
    column: int
    end_line: int
    end_column: int
    source: str


class ValidationResponse(BaseModel):
    valid: bool
    errors: list[ValidationError]


class CreateJobResponse(BaseModel):
    job_id: str
    status: JobStatus


class JobListItem(BaseModel):
    job_id: str
    status: JobStatus
    total_functions: int
    processed_functions: int
    error: str | None
    created_at: str
    snippet: str


class WsEvent(BaseModel):
    """Discriminated WebSocket event. 'type' determines which other fields are present."""

    type: str = Field(
        ...,
        description="Event type: job_started | function_done | job_complete | error",
    )
    total_functions: int | None = None
    function_name: str | None = None
    mermaid: str | None = None
    span_map: dict[str, list[int]] | None = None
    too_large: bool | None = None
    processed: int | None = None
    total: int | None = None
    status: str | None = None
    message: str | None = None
