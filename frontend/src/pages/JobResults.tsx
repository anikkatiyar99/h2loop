import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getJob } from "../api/client";
import { MermaidDiagram } from "../components/MermaidDiagram";
import { PageHeader } from "../components/PageHeader";
import { SourceHighlight } from "../components/SourceHighlight";
import { Badge, Card, StatusPill } from "../components/ui";
import { useJobSocket } from "../hooks/useJobSocket";
import type { FunctionResult } from "../api/contracts";

type ViewMode = "split" | "diagram" | "source";
const VIEW_MODE_STORAGE_KEY = "c-analyser.results.view_mode";

export function JobResults() {
  const { jobId } = useParams<{ jobId: string }>();
  const socketState = useJobSocket(jobId ?? null);
  const { functions, processed, total, complete, connected, error } = socketState;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [highlightedLines, setHighlightedLines] = useState<[number, number] | null>(null);
  const [sourceCode, setSourceCode] = useState("");
  const [sourceLoadError, setSourceLoadError] = useState(false);
  const [completeBanner, setCompleteBanner] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const sourcePaneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedIndex(0);
    setHighlightedLines(null);
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    getJob(jobId)
      .then((d) => setSourceCode(d.source_code ?? ""))
      .catch(() => setSourceLoadError(true));
  }, [jobId]);

  useEffect(() => {
    if (!complete) {
      return;
    }

    let hideTimer = 0;
    const showTimer = window.setTimeout(() => {
      setCompleteBanner(true);
      hideTimer = window.setTimeout(() => setCompleteBanner(false), 4000);
    }, 0);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [complete]);

  useEffect(() => {
    // Initialise isMobile and viewMode from live browser state on first mount.
    const mobile = window.innerWidth < 900;
    setIsMobile(mobile);

    const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (saved === "split" || saved === "diagram" || saved === "source") {
      setViewMode(saved);
    } else {
      setViewMode(window.innerWidth < 1280 ? "diagram" : "split");
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const selectedFn: FunctionResult | undefined = functions[selectedIndex];
  const lineLabel = highlightedLines
    ? highlightedLines[0] === highlightedLines[1]
      ? `L${highlightedLines[0] + 1}`
      : `L${highlightedLines[0] + 1}-${highlightedLines[1] + 1}`
    : null;
  const sourceAvailable = Boolean(sourceCode) || sourceLoadError;

  const handleNodeClick = useCallback((nodeId: string) => {
    if (!selectedFn?.span_map) return;
    const span = selectedFn.span_map[nodeId];
    if (span) {
      setHighlightedLines(span as [number, number]);
      if (sourceAvailable) {
        setViewMode((current) => {
          if (current === "split" || current === "source") return current;
          return isMobile ? "source" : "split";
        });
      }
      requestAnimationFrame(() => {
        sourcePaneRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      });
    }
  }, [selectedFn, sourceAvailable, isMobile]);

  const activeViewMode = sourceAvailable ? viewMode : "diagram";

  return (
    <div className="flex flex-col gap-5">
        <PageHeader
          eyebrow="Inspector"
          title={jobId ? `Job ${jobId.slice(0, 8)}` : "Inspector"}
          subtitle="Review each function in a left rail, switch between diagram and source views, and keep analysis details in one workspace."
          actions={
            jobId ? <Badge tone="neutral">Job {jobId.slice(0, 8)}</Badge> : undefined
          }
        />

        {functions.length === 0 && complete ? (
          <Card className="py-10 text-center">
            <h2 className="text-2xl font-semibold text-slate-100">No functions found</h2>
            <p className="mx-auto max-w-xl text-sm leading-6 text-slate-500">
              This file completed analysis, but no function definitions were detected.
            </p>
          </Card>
        ) : null}

        {functions.length === 0 && !complete ? (
          <Card className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusPill status="in_progress" />
              {jobId ? <Badge tone="neutral">Job {jobId.slice(0, 8)}</Badge> : null}
            </div>
            <div
              role="progressbar"
              aria-valuenow={total ? Math.round((processed / total) * 100) : 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Analysis progress"
              className="h-px w-full overflow-hidden rounded-full bg-slate-800"
            >
              <div
                className="h-full rounded-full bg-cyan-400/70 transition-all duration-500"
                style={{ width: total ? `${(processed / total) * 100}%` : "6%" }}
              />
            </div>
            <div className="text-sm text-slate-500">
              Preparing the workspace. {processed ? `${processed} functions processed.` : "Waiting for the first parsed function."}
            </div>
            {!connected ? (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-sm text-amber-300">
                Connection interrupted. Attempting to reconnect.
              </div>
            ) : null}
            {error ? (
              <div className="rounded-lg border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-sm text-rose-300">
                {error}
              </div>
            ) : null}
          </Card>
        ) : null}

        {functions.length > 0 ? (
          <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <Card className="overflow-hidden p-0 xl:sticky xl:top-[72px]">
              <div className="border-b border-slate-800/80 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={complete ? "success" : "in_progress"} />
                  {jobId ? (
                    <code className="rounded border border-slate-800/80 bg-slate-950 px-2 py-0.5 font-mono text-[11px] text-slate-500">
                      {jobId.slice(0, 8)}
                    </code>
                  ) : null}
                </div>

                {!complete ? (
                  <div className="mt-3 grid gap-2">
                    <div
                      role="progressbar"
                      aria-valuenow={total ? Math.round((processed / total) * 100) : 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Analysis progress"
                      className="h-px w-full overflow-hidden rounded-full bg-slate-800"
                    >
                      <div
                        className="h-full rounded-full bg-cyan-400/70 transition-all duration-500"
                        style={{ width: total ? `${(processed / total) * 100}%` : "0%" }}
                      />
                    </div>
                    <div className="text-xs text-slate-600">
                      {processed} / {total || "?"} functions
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2.5">
                      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">Functions</div>
                      <div className="mt-1.5 text-lg font-semibold tabular-nums text-slate-100">{functions.length}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2.5">
                      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">Socket</div>
                      <div className={`mt-1.5 text-lg font-semibold ${connected ? "text-emerald-400" : "text-rose-400"}`}>{connected ? "Live" : "Off"}</div>
                    </div>
                  </div>
                )}

                {!connected && !complete ? (
                  <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-300">
                    Connection interrupted. Attempting to reconnect.
                  </div>
                ) : null}
                {error ? (
                  <div className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs text-rose-300">
                    {error}
                  </div>
                ) : null}
                {completeBanner ? (
                  <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-2 text-xs font-medium text-emerald-300">
                    Analysis complete — {functions.length} function{functions.length !== 1 ? "s" : ""} analyzed.
                  </div>
                ) : null}
              </div>

              <div className="border-b border-slate-800/80 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Functions</div>
                  <span className="rounded border border-slate-800/80 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{functions.length}</span>
                </div>
              </div>

              {isMobile ? (
                <div className="px-4 py-3">
                  <select
                    aria-label="Select function"
                    className="w-full rounded-lg border border-slate-700/80 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-slate-600"
                    value={selectedIndex}
                    onChange={(e) => {
                      setSelectedIndex(Number(e.target.value));
                      setHighlightedLines(null);
                    }}
                  >
                    {functions.map((fn, i) => (
                      <option key={fn.name} value={i}>
                        {fn.too_large ? "[complex] " : ""}
                        {fn.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-360px)] overflow-y-auto p-2">
                  <div className="grid gap-0.5">
                    {functions.map((fn, i) => (
                      <button
                        key={fn.name}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                          i === selectedIndex
                            ? "bg-slate-800/80 text-slate-100 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]"
                            : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
                        }`}
                        onClick={() => {
                          setSelectedIndex(i);
                          setHighlightedLines(null);
                        }}
                      >
                        <div className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
                          {i === selectedIndex && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                          )}
                          <span className="truncate font-mono text-[12px]">{fn.name}</span>
                        </div>
                        {fn.too_large ? (
                          <span className="shrink-0 rounded border border-amber-400/20 bg-amber-400/8 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                            complex
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <div className="grid min-w-0 gap-5">
              {selectedFn ? (
                <Card className="overflow-hidden p-0">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 px-5 py-4">
                    <div>
                      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">Selected function</div>
                      <h2 className="mt-1 font-mono text-xl font-semibold tracking-tight text-slate-50">{selectedFn.name}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {selectedFn.too_large ? (
                          <Badge tone="warning">Too complex</Badge>
                        ) : (
                          <Badge tone="success">Diagram ready</Badge>
                        )}
                        {lineLabel ? <Badge tone="accent">{lineLabel}</Badge> : null}
                      </div>
                    </div>

                    <div className="inline-flex rounded-lg border border-slate-800/80 bg-slate-950/80 p-0.5">
                      <ViewToggle
                        label="Split"
                        active={activeViewMode === "split"}
                        onClick={() => setViewMode("split")}
                        disabled={!sourceAvailable}
                      />
                      <ViewToggle
                        label="Diagram"
                        active={activeViewMode === "diagram"}
                        onClick={() => setViewMode("diagram")}
                      />
                      <ViewToggle
                        label="Code"
                        active={activeViewMode === "source"}
                        onClick={() => setViewMode("source")}
                        disabled={!sourceAvailable}
                      />
                    </div>
                  </div>

                  <div className="px-5 py-5">
                    {selectedFn.too_large ? (
                      <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-300">
                        Function too complex to diagram. Simplify the function or inspect it directly in the source pane.
                      </div>
                    ) : (
                      <div
                        className={
                          activeViewMode === "split" && sourceAvailable && !isMobile
                            ? "grid gap-5 grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]"
                            : "grid gap-5"
                        }
                      >
                        {activeViewMode !== "source" ? (
                          <div className="min-w-0">
                            {complete ? (
                              <MermaidDiagram syntax={selectedFn.mermaid} onNodeClick={handleNodeClick} />
                            ) : (
                              <div className="flex h-48 items-center justify-center gap-3">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400/80" />
                                <span className="font-mono text-[11px] text-slate-500">
                                  Waiting for all functions&hellip; {processed}/{total || "?"}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : null}

                        {sourceAvailable && activeViewMode !== "diagram" ? (
                          <div
                            ref={sourcePaneRef}
                            className="min-w-0 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4"
                          >
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5">
                              <div>
                                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">Source trace</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Click a node to highlight its source span.
                                </div>
                              </div>
                              {lineLabel ? <Badge tone="accent">{lineLabel}</Badge> : null}
                            </div>
                            {sourceLoadError && !sourceCode ? (
                              <div className="rounded-lg border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-300">
                                Source code unavailable.
                              </div>
                            ) : (
                              <SourceHighlight code={sourceCode} highlightedLines={highlightedLines} />
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </Card>
              ) : (
                <Card>
                  <div className="animate-pulse">
                    <div className="mb-3 h-5 w-2/5 rounded-md bg-slate-800/80" />
                    <div className="h-[360px] rounded-xl bg-slate-900/60" />
                  </div>
                </Card>
              )}
            </div>
          </div>
        ) : null}
      </div>
  );
}

function ViewToggle({
  label,
  active,
  onClick,
  disabled = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-md px-3.5 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none",
        active
          ? "bg-slate-800/90 text-slate-100 shadow-[inset_0_1px_0_rgba(148,163,184,0.07)]"
          : "text-slate-500 hover:text-slate-300",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
