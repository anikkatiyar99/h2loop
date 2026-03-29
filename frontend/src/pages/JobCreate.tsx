import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createJob, validateCode } from "../api/client";
import { CodeEditor, type EditorDiagnostic } from "../components/CodeEditor";
import { PageHeader } from "../components/PageHeader";
import { Badge, Button, Card } from "../components/ui";
import { useSyntaxValidation } from "../hooks/useSyntaxValidation";
import { MAX_CODE_BYTES } from "../lib/constants";
import { formatBytes, formatSyntaxError } from "../lib/format";
import type { SyntaxValidationError } from "../api/contracts";

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "An unexpected error occurred";
}

const STARTER_TEMPLATE = `#include <stdio.h>

int main(void) {
  return 0;
}
`;

export function JobCreate() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"paste" | "upload">("paste");
  const [code, setCode] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lineCount = Math.max(code.split("\n").length, 1);
  const byteCount = useMemo(() => new TextEncoder().encode(code).length, [code]);
  const [serverErrors, setServerErrors] = useState<SyntaxValidationError[]>([]);
  const { errors: syntaxErrors, isValidating } = useSyntaxValidation(code);
  const allErrors = serverErrors.length > 0 ? serverErrors : syntaxErrors;
  const syntaxDiagnostics: EditorDiagnostic[] = allErrors.map((entry) => ({
    message: entry.message,
    startLineNumber: entry.line,
    startColumn: entry.column,
    endLineNumber: entry.end_line,
    endColumn: entry.end_column,
    severity: "error",
  }));
  const firstSyntaxError = allErrors[0] ?? null;
  const runDisabled = submitting || isValidating || !code.trim() || byteCount > MAX_CODE_BYTES || allErrors.length > 0;

  useEffect(() => {
    setError(null);
    setServerErrors([]);
  }, [code]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".c")) {
      setError("Please upload a .c file");
      return;
    }
    if (file.size > MAX_CODE_BYTES) {
      setError("File exceeds 500 KB limit");
      return;
    }
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setError("Failed to read file");
    };
    reader.onload = (ev) => setCode((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!code.trim()) {
      setError("Please paste or upload C code");
      return;
    }
    if (new TextEncoder().encode(code).length > MAX_CODE_BYTES) {
      setError("Code exceeds 500 KB limit");
      return;
    }

    setSubmitting(true);
    try {
      const validationBody = await validateCode(code);
      const validationErrors = Array.isArray(validationBody.errors) ? validationBody.errors : [];
      if (validationBody.valid === false) {
        setServerErrors(validationErrors);
        const firstError = validationErrors[0];
        throw new Error(firstError ? formatSyntaxError(firstError) : "Code contains syntax errors");
      }

      setServerErrors([]);
      const data = await createJob({ code });
      navigate(`/jobs/${data.job_id}`);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
        <PageHeader
          eyebrow="Workspace"
          title="New analysis"
          subtitle="Load a C file, inspect the source in-editor, then run AST traversal into Mermaid-based function views."
          actions={
            <>
              <Badge tone="accent">AST + Mermaid</Badge>
              <Badge tone="neutral">Clang-gated</Badge>
            </>
          }
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden p-0">
            <form className="flex h-full flex-col" onSubmit={handleSubmit}>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 px-5 py-3">
                <div role="tablist" className="inline-flex rounded-lg border border-slate-800/80 bg-slate-950/80 p-0.5">
                  <button
                    role="tab"
                    aria-selected={tab === "paste"}
                    type="button"
                    className={`rounded-md px-4 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] ${tab === "paste" ? "bg-slate-800 text-slate-50 shadow-[inset_0_1px_0_rgba(148,163,184,0.07)]" : "text-slate-500 hover:text-slate-300"}`}
                    onClick={() => setTab("paste")}
                  >
                    Paste
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "upload"}
                    type="button"
                    className={`rounded-md px-4 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] ${tab === "upload" ? "bg-slate-800 text-slate-50 shadow-[inset_0_1px_0_rgba(148,163,184,0.07)]" : "text-slate-500 hover:text-slate-300"}`}
                    onClick={() => setTab("upload")}
                  >
                    Upload
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{lineCount} line{lineCount !== 1 ? "s" : ""}</Badge>
                  <Badge tone="neutral">{formatBytes(byteCount)}</Badge>
                  <Badge tone="neutral">500 KB max</Badge>
                  {isValidating ? <Badge tone="accent">Checking code</Badge> : null}
                  {firstSyntaxError ? <Badge tone="warning">Code blocked</Badge> : null}
                </div>
              </div>

              <div className="flex flex-col gap-4 px-5 py-4">
                {tab === "upload" ? (
                  <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-100">Attach source file</div>
                        <div className="mt-1 text-sm text-slate-500">
                          Choose a single `.c` file. The editor stays live so you can review or tweak before running.
                        </div>
                      </div>
                      <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                        Choose file
                      </Button>
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".c"
                      onChange={handleFile}
                      className="hidden"
                    />
                    {fileName ? (
                      <div className="mt-4 rounded-lg border border-slate-800 bg-[#08101b] px-4 py-3 text-sm text-slate-300">
                        <div className="font-medium text-slate-100">{fileName}</div>
                        <div className="mt-1 text-slate-500">{lineCount} lines loaded into the editor</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <CodeEditor
                  value={code}
                  onChange={setCode}
                  height={560}
                  diagnostics={syntaxDiagnostics}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/80 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  {error ? (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                      {error}
                    </div>
                  ) : byteCount > MAX_CODE_BYTES ? (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                      Code exceeds 500 KB limit.
                    </div>
                  ) : isValidating ? (
                    <div className="text-sm text-slate-500">
                      Checking code with Clang before analysis.
                    </div>
                  ) : firstSyntaxError ? (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                      {formatSyntaxError(firstSyntaxError)}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">
                      {code.trim()
                        ? "Editor ready. Run analysis when the source looks right."
                        : "Paste code or attach a `.c` file to start."}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setCode(STARTER_TEMPLATE);
                      setFileName(null);
                      setError(null);
                      setTab("paste");
                    }}
                  >
                    Insert template
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setCode("");
                      setFileName(null);
                      setError(null);
                    }}
                  >
                    Clear
                  </Button>
                  <Button type="submit" disabled={runDisabled} className="px-6 py-2.5 text-sm font-semibold">
                    {submitting ? "Submitting..." : isValidating ? "Checking..." : "Run analysis"}
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          <div className="grid gap-4">
            <Card className="p-0">
              <div className="border-b border-slate-800/80 px-5 py-4">
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Configuration</div>
              </div>
              <div className="grid gap-3 px-5 py-5">
                <div className="grid gap-2 text-sm text-slate-400">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3.5 py-2.5">
                    <span className="text-slate-500">Source</span>
                    <span className="font-mono text-[12px] text-slate-300">C file (.c)</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3.5 py-2.5">
                    <span className="text-slate-500">Validation</span>
                    <span className="font-mono text-[12px] text-slate-300">Clang</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3.5 py-2.5">
                    <span className="text-slate-500">Size limit</span>
                    <span className="font-mono text-[12px] text-slate-300">500 KB</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3.5 py-2.5">
                    <span className="text-slate-500">Output</span>
                    <span className="font-mono text-[12px] text-slate-300">Mermaid / fn</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3.5 py-2.5">
                    <span className="text-slate-500">Traversal</span>
                    <span className="font-mono text-[12px] text-slate-300">AST + CFG</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-0">
              <div className="border-b border-slate-800/80 px-5 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pipeline</div>
              </div>
              <div className="grid gap-3 px-5 py-5 text-sm leading-6 text-slate-400">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3">
                  Parse the source and locate every function definition.
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3">
                  Traverse control flow and stream diagrams as each function completes.
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3">
                  Click any rendered node later to jump back to its source span.
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
  );
}
