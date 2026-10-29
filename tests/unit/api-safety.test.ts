import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { fetchValidatedJson } from "@/lib/api/http";
import { FixedWindowRateLimiter } from "@/lib/api/rate-limit";
import { readJson } from "@/lib/api/response";

describe("API safety controls", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("blocks arbitrary outbound origins before fetch", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(fetchValidatedJson(new URL("https://attacker.test/internal"), z.object({ ok: z.boolean() }))).rejects.toMatchObject({ code: "OUTBOUND_URL_BLOCKED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries transient failures with a bounded attempt count", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { errors: [{ reason: "backendError" }] } }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchValidatedJson(new URL("https://www.googleapis.com/test"), z.object({ ok: z.boolean() }), {}, { retries: 1 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("enforces fixed-window rate limits and resets on boundary", () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000);
    expect(limiter.check("client", 0).remaining).toBe(1);
    expect(limiter.check("client", 1).remaining).toBe(0);
    expect(() => limiter.check("client", 2)).toThrow(AppError);
    expect(limiter.check("client", 1_000).remaining).toBe(1);
  });

  it("rejects wrong content types and oversized bodies", async () => {
    const schema = z.object({ value: z.string() });
    await expect(readJson(new Request("http://local.test", { method: "POST", body: "value=x", headers: { "content-type": "application/x-www-form-urlencoded" } }), schema)).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    const body = JSON.stringify({ value: "x".repeat(70_000) });
    await expect(readJson(new Request("http://local.test", { method: "POST", body, headers: { "content-type": "application/json" } }), schema)).rejects.toThrow("REQUEST_TOO_LARGE");
  });
});
