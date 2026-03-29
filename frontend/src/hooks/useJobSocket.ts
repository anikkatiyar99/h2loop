import { useEffect, useState } from "react";
import type { FunctionResult, WsEvent } from "../api/contracts";

interface JobSocketState {
  functions: FunctionResult[];
  processed: number;
  total: number;
  complete: boolean;
  error: string | null;
  connected: boolean;
}

function normalizeSpanMap(
  spanMap: Record<string, number[]> | undefined,
): Record<string, [number, number]> {
  if (!spanMap) {
    return {};
  }

  const normalized: Record<string, [number, number]> = {};
  for (const [nodeId, span] of Object.entries(spanMap)) {
    if (span.length < 2) {
      continue;
    }
    normalized[nodeId] = [span[0], span[1]];
  }

  return normalized;
}

export function useJobSocket(jobId: string | null) {
  const [state, setState] = useState<JobSocketState>({
    functions: [],
    processed: 0,
    total: 0,
    complete: false,
    error: null,
    connected: false,
  });

  useEffect(() => {
    if (!jobId) return;

    let active = true;
    let retryScheduled = false;
    let reconnectTimer = 0;
    let socket: WebSocket | null = null;
    let completed = false;

    const connect = () => {
      retryScheduled = false;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws/jobs/${jobId}`;
      const ws = new WebSocket(url);
      socket = ws;

      ws.onopen = () => {
        if (!active) return;
        setState((s) => ({ ...s, connected: true, error: null }));
      };

      ws.onmessage = (ev) => {
        if (!active) return;
        let event: WsEvent;
        try {
          event = JSON.parse(ev.data) as WsEvent;
        } catch {
          return;
        }

        if (event.type === "job_started") {
          setState((s) => ({ ...s, total: event.total_functions ?? 0 }));
        } else if (event.type === "function_done") {
          const fn: FunctionResult = {
            name: event.function_name!,
            mermaid: event.mermaid ?? "",
            span_map: normalizeSpanMap(event.span_map),
            too_large: event.too_large ?? false,
          };
          setState((s) => {
            const existing = s.functions.findIndex((f) => f.name === fn.name);
            const functions = existing >= 0
              ? s.functions.map((f, i) => i === existing ? fn : f)
              : [...s.functions, fn];
            return { ...s, functions, processed: event.processed ?? s.processed, total: event.total ?? s.total };
          });
        } else if (event.type === "job_complete") {
          completed = true;
          setState((s) => ({ ...s, complete: true }));
        } else if (event.type === "error") {
          completed = true;
          setState((s) => ({
            ...s,
            error: event.message ?? "Unknown error",
            complete: true,
          }));
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setState((s) => ({ ...s, connected: false }));
        if (!retryScheduled && !completed) {
          retryScheduled = true;
          reconnectTimer = window.setTimeout(() => {
            if (active && !completed) {
              connect();
            }
          }, 1500);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();
    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [jobId]);

  return state;
}
