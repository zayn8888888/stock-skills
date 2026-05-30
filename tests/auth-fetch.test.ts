import { afterEach, describe, expect, it, vi } from "vitest";

import { authFetch, resetAuthTokenForTests } from "@/lib/api/auth-fetch";

describe("authFetch", () => {
  afterEach(() => {
    resetAuthTokenForTests();
    vi.restoreAllMocks();
  });

  it("loads the local token once and adds auth headers to mutating requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "secret-token" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));

    vi.stubGlobal("fetch", fetchMock);

    await authFetch("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ title: "NVDA" }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/token", {
      cache: "no-store",
    });
    const [, requestInit] = fetchMock.mock.calls[1];
    const headers = requestInit.headers as Headers;

    expect(requestInit).toEqual(
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Requested-With")).toBe("fetch");
    expect(headers.get("Authorization")).toBe("Bearer secret-token");
  });
});
