export interface SyntaxValidationError {
  message: string;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  source: string;
}

export interface SyntaxValidationResponse {
  valid: boolean;
  errors: SyntaxValidationError[];
}

export interface CreateJobRequest {
  code: string;
}

export interface CreateJobResponse {
  job_id: string;
  status: "queued" | "in_progress" | "success" | "failed";
}

export interface FunctionResult {
  name: string;
  mermaid: string;
  span_map: Record<string, [number, number]>;
  too_large: boolean;
}

export interface JobSummary {
  job_id: string;
  status: "queued" | "in_progress" | "success" | "failed";
  total_functions: number;
  processed_functions: number;
  error: string | null;
  created_at: string;
  snippet: string;
}

export interface JobDetails {
  source_code: string;
}

export type WsEvent =
  | { type: "job_started"; total_functions: number }
  | { type: "function_done"; function_name: string; mermaid: string; span_map: Record<string, number[]>; too_large: boolean; processed: number; total: number }
  | { type: "job_complete"; status: string }
  | { type: "error"; message: string };
