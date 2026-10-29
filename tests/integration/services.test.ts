import { describe, expect, it } from "vitest";
import type { ProviderResult, ProviderStatus, SuggestionProvider, VideoDataProvider } from "@/lib/providers/types";
import { compareCompetitors } from "@/lib/services/competitors";
import { extractYouTubeInputs } from "@/lib/services/extraction";
import { researchTopic } from "@/lib/services/research";
import { discoverTrends } from "@/lib/services/trending";
import type { SuggestionObservation, VideoRecord } from "@/types/research";
import { testVideo } from "../fixtures";

const status: ProviderStatus = { id: "test", name: "TEST MOCK PROVIDER", configured: true, live: false, supplies: [], limitation: "Tests only" };
const result = <T,>(data: T): ProviderResult<T> => ({ data, retrievedAt: "2026-10-27T10:00:00.000Z", cached: false, cacheAgeSeconds: null, warnings: [] });

class MockVideoProvider implements VideoDataProvider {
  readonly status = status;
  constructor(private readonly videos: VideoRecord[]) {}
  async listVideos(ids: readonly string[]) { return result(this.videos.filter((video) => ids.includes(video.id))); }
  async searchVideos() { return result(this.videos); }
  async popularVideos() { return result(this.videos); }
  async channelVideos() { return result(this.videos); }
}
class MockSuggestionProvider implements SuggestionProvider {
  readonly status = status;
  async getSuggestions(query: string, region: string, language: string) {
    const item: SuggestionObservation = { keyword: `${query} observed`, query, position: 1, observedAt: "2026-10-27T10:00:00.000Z", region, language, sourceName: "TEST MOCK AUTOCOMPLETE", sourceType: "youtube_suggestion", sourceUrl: null };
    return result([item]);
  }
}

describe("service-level research flows", () => {
  it("returns partial extraction states and never infers missing video tags", async () => {
    const emptyTagVideo = testVideo({ tags: [], tagStatus: "empty" });
    const items = await extractYouTubeInputs(new MockVideoProvider([emptyTagVideo]), [emptyTagVideo.id, "aqz-KE-bpKQ", "https://attacker.test/video"], 10);
    expect(items[0]?.videos[0]?.tagStatus).toBe("empty");
    expect(items[0]?.videos[0]?.tags).toEqual([]);
    expect(items[1]).toMatchObject({ status: "failed", error: { code: "VIDEO_UNAVAILABLE" } });
    expect(items[2]).toMatchObject({ status: "failed", error: { code: "INVALID_YOUTUBE_INPUT" } });
  });

  it("keeps suggestions, title terms, tags, and hashtags in separate categories", async () => {
    const data = await researchTopic(new MockVideoProvider([testVideo()]), new MockSuggestionProvider(), { query: "Chhath Puja", region: "IN", language: "hi", maxResults: 25, includeSuggestions: true, includeGeneratedCandidates: false });
    expect(data.suggestions[0]?.sourceType).toBe("youtube_suggestion");
    expect(data.tags[0]?.sourceType).toBe("youtube_search");
    expect(data.hashtags.length).toBeGreaterThan(0);
    expect(data.providerMetrics).toEqual([]);
    expect(data.tags.every((metric) => metric.searchVolume === null && metric.competitionScore === null)).toBe(true);
    expect(data.tags[0]?.provenance[0]?.methodology).toContain("distinct video");
  });

  it("marks generated candidates unverified with zero evidence", async () => {
    const data = await researchTopic(new MockVideoProvider([testVideo()]), new MockSuggestionProvider(), { query: "Chhath Puja", region: "IN", language: "hi", maxResults: 10, includeSuggestions: false, includeGeneratedCandidates: true });
    expect(data.generatedCandidates.length).toBeGreaterThan(0);
    expect(data.generatedCandidates.every((metric) => metric.sourceType === "generated_candidate" && metric.evidenceCount === 0 && metric.searchVolume === null)).toBe(true);
  });

  it("computes competitor tag gaps separately from titles and hashtags", async () => {
    const reference = testVideo({ tags: ["Common", "Reference only"] });
    const competitor = testVideo({ id: "aqz-KE-bpKQ", tags: ["common", "Competitor only"], title: "Different common title", hashtags: { title: ["#Shared"], description: [] } });
    const comparison = await compareCompetitors(new MockVideoProvider([reference, competitor]), [reference.id, competitor.id], 0, 10);
    expect(comparison.commonTags).toEqual(["Common"]);
    expect(comparison.missingFromReference).toEqual(["Competitor only"]);
    expect(comparison.tagsByVideo[reference.id]).toContain("Reference only");
  });

  it("filters trend samples using real publication timestamps", async () => {
    const inside = testVideo({ publishedAt: "2026-10-27T06:00:00.000Z" });
    const outside = testVideo({ id: "aqz-KE-bpKQ", publishedAt: "2026-10-25T06:00:00.000Z" });
    const trends = await discoverTrends(new MockVideoProvider([inside, outside]), { query: "test", region: "IN", language: "en", timeframe: "24h", order: "viewCount", contentType: "all", maxResults: 50 }, new Date("2026-10-27T12:00:00.000Z"));
    expect(trends.videos.map((video) => video.id)).toEqual([inside.id]);
    expect(trends.tags[0]?.trendStatus).toBe("new_observation");
    expect(trends.tags[0]?.trendChangePercent).toBeNull();
  });
});
