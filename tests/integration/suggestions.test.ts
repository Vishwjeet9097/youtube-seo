import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { externalDataCache } from "@/lib/api/cache";
import { YouTubeSuggestionProvider } from "@/lib/providers/suggestions";

function response(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }

describe("YouTube suggestion adapter", () => {
  beforeEach(() => { externalDataCache.clear(); vi.stubEnv("YOUTUBE_SUGGESTIONS_ENABLED", "true"); vi.unstubAllGlobals(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("records only provider-returned strings with query, locale, time, and position", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(["test", [["test observed one", 0], ["test observed two", 0]]]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new YouTubeSuggestionProvider().getSuggestions("test", "IN", "hi");
    expect(result.data.map((item) => item.keyword)).toEqual(["test observed one", "test observed two"]);
    expect(result.data[0]).toMatchObject({ query: "test", region: "IN", language: "hi", position: 1, sourceType: "youtube_suggestion" });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin).toBe("https://suggestqueries-clients6.youtube.com");
    expect(url.searchParams.get("q")).toBe("test");
  });

  it("is explicitly unavailable when opt-in is disabled", async () => {
    vi.stubEnv("YOUTUBE_SUGGESTIONS_ENABLED", "false");
    const provider = new YouTubeSuggestionProvider();
    expect(provider.status.live).toBe(false);
    await expect(provider.getSuggestions("test", "US", "en")).rejects.toMatchObject({ code: "SUGGESTIONS_NOT_CONFIGURED" });
  });

  it("rejects a non-allowlisted environment endpoint", async () => {
    vi.stubEnv("YOUTUBE_SUGGESTIONS_BASE_URL", "https://attacker.test/suggest");
    const provider = new YouTubeSuggestionProvider();
    expect(provider.status.configured).toBe(false);
    await expect(provider.getSuggestions("test", "US", "en")).rejects.toMatchObject({ code: "SUGGESTIONS_NOT_CONFIGURED" });
  });
});
