import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useEffect, useMemo, useRef } from "react";

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: number;
  highlightedLines?: [number, number] | null;
  diagnostics?: EditorDiagnostic[];
}

export interface EditorDiagnostic {
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  severity: "error" | "warning";
}

function buildLintMarkers(monaco: typeof Monaco, code: string): Monaco.editor.IMarkerData[] {
  const markers: Monaco.editor.IMarkerData[] = [];
  const lines = code.split("\n");
  let braceDepth = 0;

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();

    for (const char of rawLine) {
      if (char === "{") braceDepth += 1;
      if (char === "}") braceDepth -= 1;
    }

    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) {
      return;
    }

    if (
      !trimmed.endsWith(";") &&
      !trimmed.endsWith("{") &&
      !trimmed.endsWith("}") &&
      !trimmed.endsWith(":") &&
      !trimmed.startsWith("if ") &&
      !trimmed.startsWith("if(") &&
      !trimmed.startsWith("for ") &&
      !trimmed.startsWith("for(") &&
      !trimmed.startsWith("while ") &&
      !trimmed.startsWith("while(") &&
      !trimmed.startsWith("switch ") &&
      !trimmed.startsWith("switch(") &&
      !trimmed.startsWith("else")
    ) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: "This line may be missing a trailing semicolon.",
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        startColumn: Math.max(trimmed.length, 1),
        endColumn: Math.max(trimmed.length + 1, 2),
      });
    }
  });

  if (braceDepth !== 0) {
    const lastLine = Math.max(lines.length, 1);
    markers.push({
      severity: monaco.MarkerSeverity.Error,
      message: braceDepth > 0 ? "Opening brace has no matching closing brace." : "Closing brace has no matching opening brace.",
      startLineNumber: lastLine,
      endLineNumber: lastLine,
      startColumn: 1,
      endColumn: Math.max(lines[lastLine - 1]?.length ?? 1, 1),
    });
  }

  return markers;
}

export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  height = 360,
  highlightedLines = null,
  diagnostics = [],
}: CodeEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const diagnosticsRef = useRef(diagnostics);
  const highlightedLinesRef = useRef(highlightedLines);

  useEffect(() => { diagnosticsRef.current = diagnostics; }, [diagnostics]);
  useEffect(() => { highlightedLinesRef.current = highlightedLines; }, [highlightedLines]);

  // Memoize the diagnostic marker shapes keyed on the diagnostics (errors) prop so
  // the mapping is not recomputed on every keystroke — only when diagnostics change.
  const diagnosticMarkerShapes = useMemo(
    () =>
      diagnostics.map((diagnostic) => ({
        isSeverityError: diagnostic.severity === "error",
        message: diagnostic.message,
        startLineNumber: diagnostic.startLineNumber,
        endLineNumber: diagnostic.endLineNumber,
        startColumn: diagnostic.startColumn,
        endColumn: diagnostic.endColumn,
      })),
    [diagnostics],
  );
  const diagnosticMarkerShapesRef = useRef(diagnosticMarkerShapes);
  useEffect(() => { diagnosticMarkerShapesRef.current = diagnosticMarkerShapes; }, [diagnosticMarkerShapes]);

  const handleBeforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme("c-analyser-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "64748b" },
        { token: "keyword", foreground: "7dd3fc" },
        { token: "string", foreground: "86efac" },
        { token: "number", foreground: "fbbf24" },
        { token: "type.identifier", foreground: "c4b5fd" },
      ],
      colors: {
        "editor.background": "#08101b",
        "editor.foreground": "#dbe4ef",
        "editorLineNumber.foreground": "#475569",
        "editorLineNumber.activeForeground": "#cbd5e1",
        "editorCursor.foreground": "#67e8f9",
        "editor.lineHighlightBackground": "#0f172a",
        "editor.selectionBackground": "#0b2942",
        "editor.selectionHighlightBackground": "#10263f",
        "editor.inactiveSelectionBackground": "#0f1f33",
        "editorIndentGuide.background1": "#162032",
        "editorIndentGuide.activeBackground1": "#24324a",
        "editorWhitespace.foreground": "#1e293b",
        "editorGutter.background": "#08101b",
        "editorBracketMatch.background": "#082f49",
        "editorBracketMatch.border": "#38bdf8",
        "scrollbarSlider.background": "#1e293b",
        "scrollbarSlider.hoverBackground": "#334155",
        "scrollbarSlider.activeBackground": "#475569",
      },
    });
  };

  const options = useMemo<Monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      readOnly,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: "off",
      fontFamily: "IBM Plex Mono, JetBrains Mono, monospace",
      fontSize: 13.5,
      lineHeight: 23,
      tabSize: 2,
      renderLineHighlight: "all",
      renderWhitespace: "selection",
      smoothScrolling: true,
      contextmenu: true,
      glyphMargin: !readOnly,
      folding: !readOnly,
      lineNumbersMinChars: 3,
      overviewRulerBorder: false,
      padding: { top: 16, bottom: 18 },
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      bracketPairColorization: { enabled: true },
    }),
    [readOnly],
  );

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    const model = editor.getModel();
    if (!model) return;

    monaco.languages.setLanguageConfiguration("c", {
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "(", close: ")" },
        { open: "[", close: "]" },
        { open: '"', close: '"' },
      ],
    });

    const applyState = () => {
      const currentHighlightedLines = highlightedLinesRef.current;
      const currentDiagnosticShapes = diagnosticMarkerShapesRef.current;

      const markers = [
        ...(readOnly ? [] : buildLintMarkers(monaco, model.getValue())),
        ...currentDiagnosticShapes.map((shape) => ({
          severity: shape.isSeverityError
            ? monaco.MarkerSeverity.Error
            : monaco.MarkerSeverity.Warning,
          message: shape.message,
          startLineNumber: shape.startLineNumber,
          endLineNumber: shape.endLineNumber,
          startColumn: shape.startColumn,
          endColumn: shape.endColumn,
        })),
      ];
      monaco.editor.setModelMarkers(model, "c-inline-lint", markers);

      const decorations =
        currentHighlightedLines === null
          ? []
          : [
              {
                range: new monaco.Range(
                  currentHighlightedLines[0] + 1,
                  1,
                  currentHighlightedLines[1] + 1,
                  1,
                ),
                options: {
                  isWholeLine: true,
                  className: "monaco-line-highlight",
                  glyphMarginClassName: "monaco-line-highlight-glyph",
                },
              },
            ];

      decorationsRef.current?.clear();
      decorationsRef.current = editor.createDecorationsCollection(decorations);
    };

    applyState();
    model.onDidChangeContent(() => {
      applyState();
    });
  };

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;

    const markers = [
      ...(readOnly ? [] : buildLintMarkers(monaco, model.getValue())),
      ...diagnostics.map((diagnostic) => ({
        severity:
          diagnostic.severity === "error"
            ? monaco.MarkerSeverity.Error
            : monaco.MarkerSeverity.Warning,
        message: diagnostic.message,
        startLineNumber: diagnostic.startLineNumber,
        endLineNumber: diagnostic.endLineNumber,
        startColumn: diagnostic.startColumn,
        endColumn: diagnostic.endColumn,
      })),
    ];
    monaco.editor.setModelMarkers(model, "c-inline-lint", markers);

    const decorations =
      highlightedLines === null
        ? []
        : [
            {
              range: new monaco.Range(
                highlightedLines[0] + 1,
                1,
                highlightedLines[1] + 1,
                1,
              ),
              options: {
                isWholeLine: true,
                className: "monaco-line-highlight",
                glyphMarginClassName: "monaco-line-highlight-glyph",
              },
            },
          ];

    decorationsRef.current?.clear();
    decorationsRef.current = editor.createDecorationsCollection(decorations);

    if (highlightedLines !== null) {
      const startLine = highlightedLines[0] + 1;
      const endLine = highlightedLines[1] + 1;
      editor.setSelection(new monaco.Range(startLine, 1, startLine, 1));
      editor.revealRangeInCenterIfOutsideViewport(
        new monaco.Range(startLine, 1, endLine, 1),
        monaco.editor.ScrollType.Smooth,
      );
    }
  }, [diagnostics, highlightedLines, readOnly, value]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-[#08101b] p-1 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]">
      <Editor
        beforeMount={handleBeforeMount}
        height={height}
        defaultLanguage="c"
        language="c"
        value={value}
        onChange={(next) => onChange?.(next ?? "")}
        onMount={handleMount}
        theme="c-analyser-dark"
        options={options}
      />
    </div>
  );
}
