import { useMemo } from "react";
import { PageHeader } from "../components/PageHeader";
import { useJobList } from "../hooks/useJobList";
import { ButtonLink, Card, StatusPill } from "../components/ui";

export function JobList() {
  const { jobs, connError, loading } = useJobList();
  const counts = useMemo(() => ({
    running: jobs.filter((j) => j.status === "in_progress").length,
    queued: jobs.filter((j) => j.status === "queued").length,
    complete: jobs.filter((j) => j.status === "success").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  }), [jobs]);

  return (
    <div className="flex flex-col gap-5">
        <PageHeader
          eyebrow="Jobs"
          title="Job monitor"
          subtitle="Watch active analyses, reopen finished runs, and jump straight back into the workspace when you need another pass."
        />

        {connError ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Connection lost. Retrying the jobs feed.
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Running" value={counts.running} tone="cyan" />
          <MetricCard label="Queued" value={counts.queued} tone="amber" />
          <MetricCard label="Completed" value={counts.complete} tone="emerald" />
          <MetricCard label="Failed" value={counts.failed} tone="rose" />
        </div>

        {jobs.length === 0 && loading ? (
          <Card className="py-10 text-center">
            <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-slate-400" />
            <p className="mt-4 text-sm text-slate-500">Loading analyses&hellip;</p>
          </Card>
        ) : jobs.length === 0 && !loading ? (
          <Card className="py-10 text-center">
            <h2 className="text-2xl font-semibold text-slate-100">No analyses yet</h2>
            <p className="mx-auto max-w-xl text-sm leading-6 text-slate-500">
              Start a run to generate Mermaid diagrams and source-linked control-flow views.
            </p>
            <div className="mt-4">
              <ButtonLink to="/">Open workspace</ButtonLink>
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="hidden grid-cols-[minmax(0,1.2fr)_140px_170px_170px] gap-4 border-b border-slate-800/80 px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 md:grid">
              <div>Job</div>
              <div>Status</div>
              <div>Progress</div>
              <div className="text-right">Actions</div>
            </div>

            <div className="divide-y divide-slate-800/50">
              {jobs.map((job) => (
                <div
                  key={job.job_id}
                  className="grid gap-4 px-5 py-4 transition-colors hover:bg-slate-900/40 md:grid-cols-[minmax(0,1.2fr)_140px_170px_170px] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <code className="rounded border border-slate-800/80 bg-slate-950 px-2 py-0.5 font-mono text-[11px] text-slate-500">
                        {job.job_id.slice(0, 8)}
                      </code>
                      <span className="text-[11px] tabular-nums text-slate-600">{new Date(job.created_at).toLocaleTimeString()}</span>
                    </div>
                    <code className="block truncate rounded-lg border border-slate-800 bg-[#08101b] px-4 py-3 text-sm text-slate-200">
                      {job.snippet || "(no preview)"}
                    </code>
                    {job.status === "failed" && job.error ? (
                      <div className="mt-2 text-sm text-rose-300">{job.error}</div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 md:justify-start">
                    <StatusPill status={job.status} />
                  </div>

                  <div className="text-sm text-slate-400">
                    {job.status === "in_progress" ? (
                      <span>{job.processed_functions} / {job.total_functions || "?"} functions</span>
                    ) : null}
                    {job.status === "queued" ? <span>Waiting to start</span> : null}
                    {job.status === "success" ? (
                      <span>{job.total_functions} function{job.total_functions !== 1 ? "s" : ""}</span>
                    ) : null}
                    {job.status === "failed" && !job.error ? <span>Job failed</span> : null}
                  </div>

                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <ButtonLink to={`/jobs/${job.job_id}`} variant={job.status === "success" ? "primary" : "secondary"}>
                      {job.status === "in_progress" ? "Watch" : "Open"}
                    </ButtonLink>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "amber" | "emerald" | "rose";
}) {
  const accent =
    tone === "cyan"
      ? { bar: "bg-cyan-400/60", num: "text-cyan-300", border: "border-cyan-400/15" }
      : tone === "amber"
        ? { bar: "bg-amber-400/60", num: "text-amber-300", border: "border-amber-400/15" }
        : tone === "emerald"
          ? { bar: "bg-emerald-400/60", num: "text-emerald-300", border: "border-emerald-400/15" }
          : { bar: "bg-rose-400/60", num: "text-rose-300", border: "border-rose-400/15" };

  return (
    <Card className={`relative overflow-hidden border p-5 ${accent.border}`}>
      <div className={`absolute left-0 top-0 h-0.5 w-full ${accent.bar}`} />
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-3 text-3xl font-semibold tabular-nums tracking-tight ${accent.num}`}>
        {value}
      </div>
    </Card>
  );
}
