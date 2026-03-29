import type {
  CreateJobRequest,
  CreateJobResponse,
  JobDetails,
  JobSummary,
  SyntaxValidationResponse,
} from "./contracts";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.detail ?? `Request failed with status ${response.status}`);
  }

  return body as T;
}

export function validateCode(code: string, signal?: AbortSignal) {
  return requestJson<SyntaxValidationResponse>("/api/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
    signal,
  });
}

export function createJob(payload: CreateJobRequest) {
  return requestJson<CreateJobResponse>("/api/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function listJobs(signal?: AbortSignal) {
  return requestJson<JobSummary[]>("/api/jobs", { signal });
}

export function getJob(jobId: string) {
  return requestJson<JobDetails>(`/api/jobs/${jobId}`);
}
