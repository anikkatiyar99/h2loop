import { afterEach, describe, expect, it, vi } from "vitest";

import { createJob, validateCode } from "./client";

describe("api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts code to the validation endpoint", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ valid: false, errors: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(validateCode("int main(void) { return 0; }")).resolves.toEqual({
      valid: false,
      errors: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/validate",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("surfaces backend detail messages for failed requests", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Syntax error at line 2" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      createJob({ code: "int main(void) {" }),
    ).rejects.toThrow("Syntax error at line 2");
  });
});
