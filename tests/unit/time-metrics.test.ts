import { describe, expect, it } from "vitest";
import { aggregateVideoTerms } from "@/lib/metrics";
import { applyHistoricalComparison, compareObservationCounts, getWindowRange, isTimestampInWindow, median, parseIsoDurationSeconds } from "@/lib/time";
import { trendFingerprint } from "@/lib/storage";
import type { TrendResult, TrendSnapshot } from "@/types/research";
import { testVideo } from "../fixtures";

describe("time windows and timestamps", () => {
  const now = new Date("2026-10-27T12:00:00.000Z");

  it.each([["24h", "2026-10-26T12:00:00.000Z"], ["48h", "2026-10-25T12:00:00.000Z"], ["7d", "2026-10-20T12:00:00.000Z"], ["28d", "2026-09-29T12:00:00.000Z"]] as const)("calculates the %s boundary", (window, start) => {
    expect(getWindowRange(window, now).start.toISOString()).toBe(start);
  });

  it("uses inclusive boundaries and rejects invalid timestamps", () => {
    const { start, end } = getWindowRange("24h", now);
    expect(isTimestampInWindow(start.toISOString(), start, end)).toBe(true);
    expect(isTimestampInWindow(end.toISOString(), start, end)).toBe(true);
    expect(isTimestampInWindow("invalid", start, end)).toBe(false);
    expect(isTimestampInWindow("2026-10-26T11:59:59.999Z", start, end)).toBe(false);
  });

  it("validates custom ranges and future endpoints", () => {
    expect(getWindowRange("custom", now, { start: "2026-10-25T00:00:00Z", end: "2026-10-26T00:00:00Z" }).end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(() => getWindowRange("custom", now, { start: "2026-10-26T00:00:00Z", end: "2026-10-28T00:00:00Z" })).toThrow("future");
  });

  it("parses ISO durations and computes medians", () => {
    expect(parseIsoDurationSeconds("PT1H2M3S")).toBe(3723);
    expect(parseIsoDurationSeconds("not-duration")).toBeNull();
    expect(median([100, 10, 30, 20])).toBe(25);
    expect(median([])).toBeNull();
  });
});

describe("transparent prevalence and history", () => {
  it("counts a term once per video while retaining observation count", () => {
    const videos = [testVideo({ tags: ["Music", "music", "Festival"] }), testVideo({ id: "aqz-KE-bpKQ", tags: ["MUSIC"], channelId: "UCbbbbbbbbbbbbbbbbbbbbbb", statistics: { viewCount: 300, likeCount: null, commentCount: null } })];
    const music = aggregateVideoTerms(videos, "tag", "youtube_search", "IN").find((row) => row.normalizedTerm === "music")!;
    expect(music.distinctVideoCount).toBe(2);
    expect(music.distinctChannelCount).toBe(2);
    expect(music.observationCount).toBe(3);
    expect(music.averageViews).toBe(200);
    expect(music.medianViews).toBe(200);
    expect(music.evidence).toHaveLength(2);
  });

  it("reports insufficient history rather than fabricated growth", () => {
    expect(compareObservationCounts(5, null)).toEqual({ status: "new_observation", changePercent: null, explanation: "Insufficient historical observations to calculate growth." });
  });

  it("classifies only comparable measured changes", () => {
    expect(compareObservationCounts(120, 100).status).toBe("rising");
    expect(compareObservationCounts(96, 100).status).toBe("stable");
    expect(compareObservationCounts(80, 100).status).toBe("falling");
  });

  it("ignores a snapshot with the same provider retrieval timestamp", () => {
    const base = makeTrendResult("2026-10-27T10:00:00.000Z", 1);
    const fingerprint = trendFingerprint(base);
    const snapshot: TrendSnapshot = { id: "snapshot", fingerprint, capturedAt: "2026-10-27T10:01:00.000Z", result: base };
    const compared = applyHistoricalComparison(base.tags, fingerprint, [snapshot], "tags", base.retrievedAt);
    expect(compared[0]?.trendStatus).toBe("new_observation");
    expect(compared[0]?.trendChangePercent).toBeNull();
  });

  it("keeps prevalence stable when count and sample size both double", () => {
    const previous = makeTrendResult("2026-10-26T10:00:00.000Z", 1);
    const current = makeTrendResult("2026-10-27T10:00:00.000Z", 2);
    const snapshot: TrendSnapshot = { id: "snapshot", fingerprint: trendFingerprint(previous), capturedAt: "2026-10-26T10:01:00.000Z", result: previous };
    const compared = applyHistoricalComparison(current.tags, trendFingerprint(current), [snapshot], "tags", current.retrievedAt);
    expect(compared[0]?.trendStatus).toBe("stable");
    expect(compared[0]?.trendChangePercent).toBe(0);
  });
});

function makeTrendResult(retrievedAt: string, count: number): TrendResult {
  const videos = Array.from({ length: count }, (_, index) => testVideo({ id: index === 0 ? "dQw4w9WgXcQ" : "aqz-KE-bpKQ", observedAt: retrievedAt, tags: ["Festival"] }));
  return { specification: { query: "test topic", region: "IN", language: "en", timeframe: "24h", customStart: null, customEnd: null, categoryId: null, order: "viewCount", contentType: "all", maxResults: 50, discoveryMethod: "youtube_search" }, query: "test topic", region: "IN", language: "en", timeframe: "24h", windowStart: "2026-10-26T10:00:00.000Z", windowEnd: "2026-10-27T10:00:00.000Z", retrievedAt, sampleSize: videos.length, discoveryMethod: "youtube_search", videos, tags: aggregateVideoTerms(videos, "tag", "youtube_search", "IN"), hashtags: [], titleKeywords: [], titlePhrases: [], warnings: [] };
}
