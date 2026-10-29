import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { externalDataCache } from "@/lib/api/cache";
import { POST as extractPost } from "@/app/api/extract/route";
import { POST as researchPost } from "@/app/api/research/route";

function request(path: string, body: unknown, identity: string) {
  return new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": identity }, body: JSON.stringify(body) });
}
function jsonResponse(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
const videoResponse = {
  items: [{ id: "dQw4w9WgXcQ", snippet: { publishedAt: "2026-10-26T10:00:00Z", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "TEST ROUTE VIDEO #Test", description: "#Fixture", channelTitle: "TEST CHANNEL", tags: ["TEST TAG"], categoryId: "27", thumbnails: {} }, statistics: { viewCount: "5" }, contentDetails: { duration: "PT1M" } }],
};

describe("route handler integration", () => {
  beforeEach(() => { externalDataCache.clear(); vi.stubEnv("YOUTUBE_API_KEY", "TEST_ONLY_KEY"); vi.stubEnv("YOUTUBE_SUGGESTIONS_ENABLED", "false"); vi.unstubAllGlobals(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("extracts public tags through the complete route/provider/service envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(videoResponse)));
    const response = await extractPost(request("/api/extract", { inputs: ["https://youtu.be/dQw4w9WgXcQ"], channelLimit: 10 }, "test-extract"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, data: [{ status: "complete", videos: [{ tags: ["TEST TAG"], tagStatus: "found" }] }], error: null });
    expect(body.meta.sampleSize).toBe(1);
  });

  it("returns a graceful configuration error without exposing secrets", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "");
    const response = await extractPost(request("/api/extract", { inputs: ["dQw4w9WgXcQ"], channelLimit: 10 }, "test-no-key"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({ status: "failed", error: { code: "YOUTUBE_NOT_CONFIGURED" } });
    expect(JSON.stringify(body)).not.toContain("TEST_ONLY_KEY");
  });

  it("validates request batches before any provider request", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await extractPost(request("/api/extract", { inputs: [], channelLimit: 500 }, "test-invalid"));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("researches a topic while clearly reporting disabled autocomplete", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: { videoId: "dQw4w9WgXcQ" } }] }))
      .mockResolvedValueOnce(jsonResponse(videoResponse));
    vi.stubGlobal("fetch", fetchMock);
    const response = await researchPost(request("/api/research", { query: "test topic", region: "US", language: "en", maxResults: 10, includeSuggestions: true, includeGeneratedCandidates: false }, "test-research"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.tags[0]).toMatchObject({ keyword: "TEST TAG", searchVolume: null, competitionScore: null, sourceType: "youtube_search" });
    expect(body.data.suggestions).toEqual([]);
    expect(body.data.warnings.some((warning: string) => warning.includes("not enabled"))).toBe(true);
  });
});
