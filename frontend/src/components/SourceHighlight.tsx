import { CodeEditor } from "./CodeEditor";

interface SourceHighlightProps {
  code: string;
  highlightedLines: [number, number] | null;
}

export function SourceHighlight({ code, highlightedLines }: SourceHighlightProps) {
  const lineCount = Math.max(code.split("\n").length, 1);
  const height = Math.min(Math.max(lineCount * 22 + 32, 260), 720);

  return (
    <CodeEditor
      value={code}
      readOnly
      highlightedLines={highlightedLines}
      height={height}
    />
  );
}
