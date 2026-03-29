import { describe, expect, it } from "vitest";

import { formatBytes, formatSyntaxError } from "./format";

describe("format helpers", () => {
  it("formats small byte sizes without conversion", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats larger byte sizes in kilobytes", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("formats syntax errors for the status rail", () => {
    expect(
      formatSyntaxError({
        message: "expected ';' after expression",
        line: 4,
        column: 12,
        end_line: 4,
        end_column: 13,
        source: "clang",
      }),
    ).toBe("Code error at line 4, column 12: expected ';' after expression");
  });
});
