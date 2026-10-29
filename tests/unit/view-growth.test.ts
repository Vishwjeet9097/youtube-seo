import { describe, expect, it } from "vitest";
import { aggregateVideoTerms } from "@/lib/metrics";
import { createTrendSnapshot, trendFingerprint } from "@/lib/storage";
import { applyHistoricalComparison } from "@/lib/time";
import type { TrendResult } from "@/types/research";
import { testVideo } from "../fixtures";

describe("same-video view growth", () => {
  it("measures views only for videos present with counts in both independent snapshots", () => {
    const previousVideo = testVideo({ observedAt: "2026-10-26T12:00:00.000Z", statistics: { viewCount: 100, likeCount: null, commentCount: null }, tags: ["Festival"] });
    const currentVideo = testVideo({ observedAt: "2026-10-27T12:00:00.000Z", statistics: { viewCount: 150, likeCount: null, commentCount: null }, tags: ["Festival"] });
    const previous = makeResult(previousVideo);
    const current = makeResult(currentVideo);
    const snapshot = createTrendSnapshot(previous);
    const compared = applyHistoricalComparison(current.tags, trendFingerprint(current), [snapshot], "tags", current.retrievedAt, current.videos);
    expect(compared[0]).toMatchObject({ viewGrowthPercent: 50, viewGrowthVideoCount: 1, firstObservedAt: previousVideo.observedAt, lastObservedAt: currentVideo.observedAt });
    expect(compared[0]?.viewGrowthExplanation).toContain("same-video pair");
  });

  it("returns null when no same-video view pair exists", () => {
    const previous = makeResult(testVideo({ observedAt: "2026-10-26T12:00:00.000Z", statistics: { viewCount: 100, likeCount: null, commentCount: null } }));
    const current = makeResult(testVideo({ id: "aqz-KE-bpKQ", observedAt: "2026-10-27T12:00:00.000Z", statistics: { viewCount: 150, likeCount: null, commentCount: null } }));
    const compared = applyHistoricalComparison(current.tags, trendFingerprint(current), [createTrendSnapshot(previous)], "tags", current.retrievedAt, current.videos);
    expect(compared[0]?.viewGrowthPercent).toBeNull();
    expect(compared[0]?.viewGrowthVideoCount).toBe(0);
  });
});

function makeResult(video: ReturnType<typeof testVideo>): TrendResult {
  const tags = aggregateVideoTerms([video], "tag", "youtube_search", "IN");
  return { specification: { query: "festival", region: "IN", language: "en", timeframe: "24h", customStart: null, customEnd: null, categoryId: null, order: "viewCount", contentType: "all", maxResults: 50, discoveryMethod: "youtube_search" }, query: "festival", region: "IN", language: "en", timeframe: "24h", windowStart: "2026-10-26T00:00:00.000Z", windowEnd: "2026-10-27T00:00:00.000Z", retrievedAt: video.observedAt, sampleSize: 1, discoveryMethod: "youtube_search", videos: [video], tags, hashtags: [], titleKeywords: [], titlePhrases: [], warnings: [] };
}
