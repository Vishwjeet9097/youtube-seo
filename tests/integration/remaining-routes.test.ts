import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { externalDataCache } from "@/lib/api/cache";
import { POST as competitorPost } from "@/app/api/competitors/route";
import { GET as statusGet } from "@/app/api/status/route";
import { POST as suggestionPost } from "@/app/api/suggestions/route";
import { POST as trendingPost } from "@/app/api/trending/route";

function request(path: string, body: unknown, identity: string) { return new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": identity }, body: JSON.stringify(body) }); }
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function video(id: string, tags: string[]) { return { id, snippet: { publishedAt: "2026-10-27T06:00:00Z", channelId: id === "dQw4w9WgXcQ" ? "UCaaaaaaaaaaaaaaaaaaaaaa" : "UCbbbbbbbbbbbbbbbbbbbbbb", title: `TEST ${id} #Shared`, description: "#Fixture", channelTitle: "TEST CHANNEL", tags, categoryId: "27", thumbnails: {} }, statistics: { viewCount: "100" }, contentDetails: { duration: "PT2M" } }; }

describe("remaining API routes", () => {
  beforeEach(() => { externalDataCache.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z")); vi.stubEnv("YOUTUBE_API_KEY", "TEST_ONLY_KEY"); vi.stubEnv("YOUTUBE_SUGGESTIONS_ENABLED", "true"); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("reports provider, local storage, and disposable cache status", async () => {
    const responseValue = statusGet();
    const body = await responseValue.json();
    expect(body.ok).toBe(true);
    expect(body.data.providers.find((item: { id: string }) => item.id === "youtube-data-api").live).toBe(true);
    expect(body.data.storage.sharedAcrossUsers).toBe(false);
    expect(body.data.cache.durable).toBe(false);
  });

  it("returns separately labeled autocomplete observations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(["topic", [["topic observed", 0]]])));
    const routeResponse = await suggestionPost(request("/api/suggestions", { query: "topic", region: "US", language: "en" }, "remaining-suggest"));
    const body = await routeResponse.json();
    expect(body.data[0]).toMatchObject({ keyword: "topic observed", sourceType: "youtube_suggestion", region: "US" });
  });

  it("discovers timestamp-filtered terms through search and metadata routes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [{ id: { videoId: "dQw4w9WgXcQ" } }] }))
      .mockResolvedValueOnce(response({ items: [video("dQw4w9WgXcQ", ["Observed Trend Tag"])] }));
    vi.stubGlobal("fetch", fetchMock);
    const routeResponse = await trendingPost(request("/api/trending", { query: "topic", region: "US", language: "en", timeframe: "24h", order: "viewCount", contentType: "all", maxResults: 10 }, "remaining-trend"));
    const body = await routeResponse.json();
    expect(routeResponse.status).toBe(200);
    expect(body.data.sampleSize).toBe(1);
    expect(body.data.tags[0]).toMatchObject({ term: "Observed Trend Tag", trendStatus: "new_observation", trendChangePercent: null, viewGrowthPercent: null });
  });

  it("returns common and reference-gap tags through the competitor route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ items: [video("dQw4w9WgXcQ", ["Common", "Reference"]), video("aqz-KE-bpKQ", ["common", "Gap"])] })));
    const routeResponse = await competitorPost(request("/api/competitors", { inputs: ["dQw4w9WgXcQ", "aqz-KE-bpKQ"], referenceIndex: 0, channelLimit: 10 }, "remaining-competitor"));
    const body = await routeResponse.json();
    expect(body.data.commonTags).toEqual(["Common"]);
    expect(body.data.missingFromReference).toEqual(["Gap"]);
  });

  it("rejects a reference index outside the submitted comparison", async () => {
    const routeResponse = await competitorPost(request("/api/competitors", { inputs: ["dQw4w9WgXcQ", "aqz-KE-bpKQ"], referenceIndex: 3, channelLimit: 10 }, "remaining-invalid-reference"));
    const body = await routeResponse.json();
    expect(routeResponse.status).toBe(400);
    expect(body.error.code).toBe("INVALID_REFERENCE");
  });
});
