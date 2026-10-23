import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, api, endpoint } from "./client";
import { clearTokens, getTokens, setTokens } from "./session";

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("api client", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    clearTokens();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the bearer token and serializes query params (arrays repeated, empties skipped)", async () => {
    setTokens({ access: "A1", refresh: "R1" });
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await api.get("/transactions/", {
      search: "abc",
      account_ids: ["x", "y"],
      page: 2,
      empty: "",
      nothing: undefined,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/transactions/?search=abc&account_ids=x&account_ids=y&page=2");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer A1");
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    setTokens({ access: "old", refresh: "R1" });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "token_not_valid", message: "expired" } }))
      .mockResolvedValueOnce(json(200, { access: "new", refresh: "R2" }))
      .mockResolvedValueOnce(json(200, { hello: "world" }));
    await expect(api.get("/profile/")).resolves.toEqual({ hello: "world" });
    expect(getTokens()).toEqual({ access: "new", refresh: "R2" });
    expect((fetchMock.mock.calls[2]![1].headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer new",
    );
  });

  it("shares a single refresh between concurrent 401s", async () => {
    setTokens({ access: "old", refresh: "R1" });
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (String(url).endsWith("/auth/refresh/")) {
        refreshCalls++;
        return json(200, { access: "new", refresh: "R2" });
      }
      const auth = (init.headers as Record<string, string>)["Authorization"];
      return auth === "Bearer new"
        ? json(200, { ok: 1 })
        : json(401, { error: { code: "x", message: "expired" } });
    });
    await Promise.all([api.get("/a/"), api.get("/b/"), api.get("/c/")]);
    expect(refreshCalls).toBe(1);
  });

  it("clears the session when the refresh token is rejected", async () => {
    setTokens({ access: "old", refresh: "dead" });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "x", message: "expired" } }))
      .mockResolvedValueOnce(json(401, { error: { code: "token_not_valid", message: "bad" } }));
    await expect(api.get("/profile/")).rejects.toMatchObject({ status: 401 });
    expect(getTokens()).toBeNull();
  });

  it("keeps the session on network failure", async () => {
    setTokens({ access: "A", refresh: "R" });
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(api.get("/profile/")).rejects.toMatchObject({ status: 0, code: "network_error" });
    expect(getTokens()).not.toBeNull();
  });

  it("maps DRF validation errors to a readable message", async () => {
    fetchMock.mockResolvedValue(
      json(400, {
        error: {
          code: "invalid",
          message: "Validation failed.",
          details: { label: ["Labels must be unique."] },
        },
      }),
    );
    const err = (await api.post("/ledgers/", {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Labels must be unique.");
    expect(err.details).toEqual({ label: ["Labels must be unique."] });
  });

  it("hides server internals on 5xx without a message", async () => {
    fetchMock.mockResolvedValue(new Response("<html>boom</html>", { status: 500 }));
    await expect(api.get("/x/")).rejects.toThrow("Something went wrong. Please try again.");
  });

  it("anonymous requests never send credentials or trigger refresh", async () => {
    setTokens({ access: "A", refresh: "R" });
    fetchMock.mockResolvedValue(
      json(401, { error: { code: "no_active_account", message: "No active account found" } }),
    );
    await expect(
      api.post("/auth/login/", { email: "a", password: "b" }, { anonymous: true }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      (fetchMock.mock.calls[0]![1].headers as Record<string, string>)["Authorization"],
    ).toBeUndefined();
    expect(getTokens()).not.toBeNull(); // a failed login must not wipe an existing session
  });

  it("endpoint() keeps the fn({ data }) call shape", async () => {
    const fn = endpoint(async (d: { n: number }) => d.n * 2);
    expect(await fn({ data: { n: 4 } })).toBe(8);
    const noArg = endpoint(async (_: void) => "ok");
    expect(await noArg()).toBe("ok");
  });

  it("204 responses resolve to undefined", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.delete("/x/1/")).resolves.toBeUndefined();
  });
});
