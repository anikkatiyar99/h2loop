import { useEffect, useState } from "react";
import { listJobs } from "../api/client";
import type { JobSummary } from "../api/contracts";
import { JOB_LIST_POLL_INTERVAL_MS } from "../lib/constants";

interface JobListState {
  jobs: JobSummary[];
  connError: boolean;
  loading: boolean;
}

export function useJobList(): JobListState {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [connError, setConnError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let timeoutId = 0;
    let failCount = 0;
    let controller = new AbortController();

    const poll = async () => {
      controller = new AbortController();
      try {
        const data = await listJobs(controller.signal);
        if (!alive) return;
        setJobs(data);
        failCount = 0;
        setConnError(false);
        setLoading(false);
      } catch {
        if (!alive) return;
        failCount += 1;
        if (failCount >= 3) {
          setConnError(true);
        }
      } finally {
        if (alive) {
          timeoutId = window.setTimeout(poll, JOB_LIST_POLL_INTERVAL_MS);
        }
      }
    };

    void poll();

    return () => {
      alive = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  return { jobs, connError, loading };
}
