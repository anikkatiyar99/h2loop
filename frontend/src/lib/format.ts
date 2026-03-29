import type { SyntaxValidationError } from "../api/contracts";

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function formatSyntaxError(error: SyntaxValidationError) {
  return `Code error at line ${error.line}, column ${error.column}: ${error.message}`;
}
